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
import { randomUUID, createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner, Not } from 'typeorm';
import { last, single } from 'rxjs';
import {
  UserRepository,
  OtpRepository,
  PurohitProfileRepository,
} from '@likemyproduct/repositories';
import {
  User,
  Otp,
  USER_ROLE,
  USER_STATUS,
} from '@likemyproduct/entities';
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
    private readonly s3Service: S3Service,
    private readonly otpRepository: OtpRepository,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
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

   async blockUser(id: number) {
    const user = await this.userRepository.findById(id);
   }
  
  async registerUser(dto: RegisterNormalUserDto) {
    return this.registerUserService(dto);
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

    // if (user.status === USER_STATUS.BLOCKED) {
    //   throw new BadRequestException('User is already blocked');
    // }

    // user.status = USER_STATUS.BLOCKED;
    // user.hashedRefreshToken = null; // Invalidate existing refresh tokens
    // user.tokenVersion += 1; // Increment token version to invalidate existing tokens

    // await this.userRepository.save(user);

    // return {
    //     success: true,
    //     message: 'User blocked successfully',
    // };
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

  async registerUserService(dto: RegisterNormalUserDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        'At least email or phone number must be provided',
      );
    }

    // 1. Verify OTP record
    const otpWhere: any[] = [];
    if (dto.phone) otpWhere.push({ phone: dto.phone, otp: dto.otp });
    if (dto.email) otpWhere.push({ email: dto.email, otp: dto.otp });

    const otpRecord = await this.otpRepository.findOne({
      where: otpWhere,
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid OTP code or contact details');
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new BadRequestException('OTP has expired');
    }

    // 2. Check if user already exists by email
    if (dto.email) {
      const existingUserByEmail = await this.userRepository.findByEmail(dto.email);
      if (existingUserByEmail) {
        throw new ConflictException('Email already in use');
      }
    }

    // 3. Check if user already exists by phone
    if (dto.phone) {
      const existingUserByPhone = await this.userRepository.findOne({
        where: { phone: dto.phone },
      });
      if (existingUserByPhone) {
        throw new ConflictException('Phone number already in use');
      }
    }

    // 4. Check if username already in use
    const existingUsername = await this.userRepository.findOne({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username already in use');
    }

    // Run database writes inside a transaction
    const savedUser = await this.dataSource.transaction(async (manager) => {
      // 5. Hash password and save user
      const hashedPassword = await bcrypt.hash(dto.password, 10);

      const newUser = manager.create(User, {
        ...(dto.email && { email: dto.email.toLowerCase() }),
        username: dto.username,
        ...(dto.phone && { phone: dto.phone }),
        firstName: dto.firstName,
        lastName: dto.lastName,
        hashedPassword: hashedPassword,
        role: otpRecord.role || USER_ROLE.CUSTOMER,
        // status: USER_STATUS.ACTIVE,
        status:
          otpRecord.role === USER_ROLE.PUROHIT
            ? USER_STATUS.PENDING
            : USER_STATUS.ACTIVE,
      });

      const saved = await manager.save(User, newUser);

      // 6. Delete OTP record after verification
      await manager.delete(Otp, { id: otpRecord.id });

      return saved;
    });

    // 7. Issue Auth Tokens
    const data = await this.issueAuthTokens(savedUser);

    return {
      message: 'User registration successful',
      ...data,
    };
  }
  
  async issueAuthTokens(user: User) {
    const accessSecret =
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      this.configService.get<string>('JWT_SECRET');

    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      this.configService.get<string>('JWT_SECRET');

    if (!accessSecret || !refreshSecret) {
      throw new InternalServerErrorException('JWT secret not configured');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = this.signJwt(payload, accessSecret, 2 * 24 * 60 * 60);
    const refreshToken = this.signJwt(payload, refreshSecret, 7 * 24 * 60 * 60);
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.userRepository.update(user.id, {
      lastLoginAt: new Date(),
      hashedRefreshToken,
    });

    return {
      tokens: {
        accessToken,
        refreshToken,
      },
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        profileImage: user.profileImage,
      },
    };
  }

  private signJwt(
    payload: Record<string, unknown>,
    secret: string,
    expiresInSeconds: number,
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const body = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedBody = this.base64UrlEncode(JSON.stringify(body));
    const data = `${encodedHeader}.${encodedBody}`;

    const signature = createHmac('sha256', secret)
      .update(data)
      .digest('base64url');

    return `${data}.${signature}`;
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value).toString('base64url');
  }
}