import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { DataSource, QueryRunner, Not } from 'typeorm';
import { last, single } from 'rxjs';
import {
  UserRepository,
  OtpRepository,
  PurohitProfileRepository,
} from '@likemyproduct/repositories';
import {
  USER_ROLE,
  USER_STATUS,
} from '@likemyproduct/entities';
import { AuthModuleService } from 'apps/auth-service/src/auth/auth-module.service';
import { S3Service } from '@likemyproduct/s3';
import { EmailService } from '@likemyproduct/email-services';
import {
  UpdateUserDto, RegisterNormalUserDto,
} from '@likemyproduct/dtos';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly purohitProfileRepository: PurohitProfileRepository,
    private readonly dataSource: DataSource,
    private readonly authModuleService: AuthModuleService,
    private readonly s3Service: S3Service,
    private readonly otpRepository: OtpRepository,
    private readonly emailService: EmailService,
  ) { }

  async updateProfileByAdmin(
    id: string,
    dto: UpdateUserDto,
    file?: Express.Multer.File,
  ) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.password) {
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      (dto as any).hashedPassword = hashedPassword;
      delete dto.password;
      delete dto.confirmPassword;
    }

    if (file) {
      const imageUrl = await this.s3Service.uploadFileHelper(
        id,
        'profileImage',
        [file],
      );
      dto.profileImage = imageUrl;
    }

    const updatedUser = await this.userRepository.updateUser(id, dto);

    const { hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } = updatedUser!;
    if (safeUser.profileImage) {
      try {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(safeUser.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }
    return {
      success: true,
      message: 'User profile updated successfully by admin',
      data: safeUser,
    };
  }

  async updateProfileByUser(
    id: string,
    dto: UpdateUserDto,
    file?: Express.Multer.File,
  ) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Normal users cannot change their role or status
    if (user.role !== USER_ROLE.ADMIN) {
      delete dto.role;
      delete dto.status;
    }

    if (dto.password) {
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      (dto as any).hashedPassword = hashedPassword;
      delete dto.password;
      delete dto.confirmPassword;
    }

    if (file) {
      const imageUrl = await this.s3Service.uploadFileHelper(
        id,
        'profileImage',
        [file],
      );
      dto.profileImage = imageUrl;
    }

    const updatedUser = await this.userRepository.updateUser(id, dto);

    const { hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } = updatedUser!;
    if (safeUser.profileImage) {
      try {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(safeUser.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }
    return {
      success: true,
      message: 'Profile updated successfully',
      data: safeUser,
    };
  }
  
  async registerUser(dto: RegisterNormalUserDto) {
    return this.authModuleService.registerUserService(dto);
  }

  async generateOtp(email: string, role: USER_ROLE) {
    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    let otpRecord = await this.otpRepository.findOne({
      where: { email },
    });

    if (otpRecord) {
      otpRecord.otp = otp;
      otpRecord.expiresAt = expiresAt;
      otpRecord.isVerified = false;
      otpRecord.role = role;
    } else {
      otpRecord = this.otpRepository.create({
        email,
        otp,
        expiresAt,
        isVerified: false,
        role,
      });
    }

    await this.otpRepository.save(otpRecord);

    await this.emailService.sendOtpEmail(email, otp);

    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }

  async verifyOtp(email: string, otp: string) {
    const otpRecord = await this.otpRepository.findOne({
      where: { email },
    });

    if (!otpRecord) {
      throw new NotFoundException('OTP not found');
    }

    if (otpRecord.isVerified) {
      throw new BadRequestException('OTP already verified');
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new BadRequestException('OTP has expired');
    }

    if (otpRecord.otp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    otpRecord.isVerified = true;

    await this.otpRepository.save(otpRecord);

    return {
      success: true,
      message: 'OTP verified successfully',
    };
  }

  // purohit status accept/reject 
  async updatePurohitStatus(id: string, status: USER_STATUS) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== USER_ROLE.PUROHIT) {
      throw new BadRequestException('Only Purohit status can be updated');
    }

    // Cannot change back to PENDING
    if (status === USER_STATUS.PENDING) {
      throw new BadRequestException(
        'Cannot change status back to PENDING',
      );
    }

    // Already in same status
    if (user.status === status) {
      throw new BadRequestException(`Purohit is already ${status}`);
    }

    // Allowed:
    // PENDING -> ACTIVE
    // PENDING -> REJECTED
    // ACTIVE -> REJECTED
    // REJECTED -> ACTIVE
    user.status = status;

    await this.userRepository.save(user);
    const existingProfile = await this.purohitProfileRepository.findOne({
      where: { userId: user.id },
    });

    if (status === USER_STATUS.ACTIVE) {
      if (!existingProfile) {
        const profile = this.purohitProfileRepository.create({
          userId: user.id,
        });

        await this.purohitProfileRepository.save(profile);
      }
    }

    if (status === USER_STATUS.REJECTED) {
      if (existingProfile) {
        await this.purohitProfileRepository.delete(existingProfile.id);
      }
    }

    return {
      success: true,
      message: `Purohit status updated to ${status} successfully`,
    };
  }
  async getApprovedPurohits() {
    const purohits = await this.userRepository.findApprovedPurohits();

    return {
      success: true,
      message: 'Purohits fetched successfully',
      data: purohits,
    };
  }
}