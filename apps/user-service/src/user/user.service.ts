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
  PurohitServiceAreaRepository,
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
import { CreatePurohitServiceAreaDto } from '@likemyproduct/dtos/user/add-prohit-address.dto';
import { UpdatePurohitServiceAreaDto } from '@likemyproduct/dtos/user/update-progit-address.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly dataSource: DataSource,
    private readonly authModuleService: AuthModuleService,
    private readonly s3Service: S3Service,
    private readonly customerAddressRepository: CustomerAddressRepository,
    private readonly purohitServiceAreaRepository: PurohitServiceAreaRepository,
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
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === USER_STATUS.BLOCKED) {
      throw new BadRequestException('User is already blocked');
    }

    user.status = USER_STATUS.BLOCKED;
    user.hashedRefreshToken = null; // Invalidate existing refresh tokens
    user.tokenVersion += 1; // Increment token version to invalidate existing tokens

    await this.userRepository.save(user);

    return {
      success: true,
      message: 'User blocked successfully',
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

  async addServiceArea(userId: number, dto: CreatePurohitServiceAreaDto) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.purohitServiceAreaRepository.findOne({
      where: {
        purohitId: userId,
        pincode: dto.pincode,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Service area already exists for this pincode',
      );
    }

    if (dto.isDefault) {
      await this.purohitServiceAreaRepository.clearDefaultAddress(userId);
    }

    const area = await this.purohitServiceAreaRepository.createArea({
      purohitId: userId,
      ...dto,
    });

    return {
      success: true,
      message: 'Service area added successfully',
      data: area,
    };
  }

  async updateServiceArea(
    userId: number,
    id: number,
    dto: UpdatePurohitServiceAreaDto,
  ) {
    const area = await this.purohitServiceAreaRepository.findById(id);

    if (!area) {
      throw new NotFoundException('Service area not found');
    }

    if (area.purohitId !== userId) {
      throw new ForbiddenException('You can update only your own service area');
    }

    // Check duplicate pincode only if pincode is being updated
    if (dto.pincode) {
      const existing =
        await this.purohitServiceAreaRepository.findByPurohitAndPincode(
          userId,
          dto.pincode,
        );

      if (existing && existing.id !== id) {
        throw new ConflictException(
          'Service area already exists for this pincode',
        );
      }
    }

    if (dto.isDefault) {
      await this.purohitServiceAreaRepository.clearDefaultAddress(userId);
    }

    const updated = await this.purohitServiceAreaRepository.updateArea(id, dto);

    return {
      success: true,
      message: 'Service area updated successfully',
      data: updated,
    };
  }

  async getMyServiceAreas(userId: number) {
    const areas =
      await this.purohitServiceAreaRepository.findByPurohitId(userId);

    return {
      success: true,
      message: 'Service areas fetched successfully',
      data: areas,
    };
  }

  async deleteServiceArea(userId: number, id: number) {
    const area = await this.purohitServiceAreaRepository.findById(id);

    if (!area) {
      throw new NotFoundException('Service area not found');
    }

    if (area.purohitId !== userId) {
      throw new ForbiddenException('You can delete only your own service area');
    }

    await this.purohitServiceAreaRepository.deleteArea(id);

    return {
      success: true,
      message: 'Service area deleted successfully',
    };
  }
}
