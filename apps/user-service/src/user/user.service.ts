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
  CustomerAddressRepository,
  UserRepository,
} from '@likemyproduct/repositories';
import {
  USER_ROLE,
  USER_STATUS,
} from '@likemyproduct/entities';
import { AuthModuleService } from 'apps/auth-service/src/auth/auth-module.service';
import { S3Service } from '@likemyproduct/s3';
import {
  UpdateUserDto,
} from '@likemyproduct/dtos';
import { Brackets } from 'typeorm';
import { GetAllUsersDto } from '@likemyproduct/dtos/user/get-all-users.dto';
import { CreateCustomerAddressDto } from '@likemyproduct/dtos/user/add-customer-address.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly dataSource: DataSource,
    private readonly authModuleService: AuthModuleService,
    private readonly s3Service: S3Service,
    private readonly customerAddressRepository: CustomerAddressRepository,
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

  async getAllUsers(query: GetAllUsersDto) {
    const { users, total } = await this.userRepository.getAllUsers(query);

    const safeUsers = await Promise.all(
      users.map(async (user) => {
        const {hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } = user;

        if (safeUser.profileImage) {
          safeUser.profileImage = await this.s3Service.getDownloadUrl(
            safeUser.profileImage,
          );
        }

        return safeUser;
      }),
    );

    return {
      success: true,
      message: 'Users fetched successfully',
      data: safeUsers,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getUserById(id: string) {
    try {
      const user = await this.userRepository.findById(id);

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const {
        hashedPassword,
        hashedRefreshToken,
        tokenVersion,
        ...safeUser
      } = user;

      if (safeUser.profileImage) {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(
          safeUser.profileImage,
        );
      }

      return {
        success: true,
        message: 'User fetched successfully',
        data: safeUser,
      };
    } catch (error) {
      console.error('Error fetching user:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to fetch user');
    }
  }

  async addAddress(userId: number, dto: CreateCustomerAddressDto) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (dto.isDefault) {
        await this.customerAddressRepository.clearDefaultAddress(userId);
      }

      const address = await this.customerAddressRepository.createAddress({
        customerId: userId,
        ...dto,
      });

      return {
        success: true,
        message: 'Address added successfully',
        data: address,
      };
    } catch (error) {
      console.error('Error adding address:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to add address');
    }
  }
}
