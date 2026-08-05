import { ConflictException, ForbiddenException,  Injectable,  InternalServerErrorException,  NotFoundException,  UnprocessableEntityException,} from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, } from 'typeorm';
import { S3Service } from '@likemyproduct/s3';
import { UpsertPlatformSettingDto } from '@likemyproduct/dtos/Platform setting/Platform.dto';
import { GetAllUsersDto } from '@likemyproduct/dtos/user/get-all-users.dto';
import { CreateCustomerAddressDto } from '@likemyproduct/dtos/user/add-customer-address.dto';
import { CreatePurohitServiceAreaDto } from '@likemyproduct/dtos/user/add-prohit-address.dto';
import { UpdatePurohitServiceAreaDto } from '@likemyproduct/dtos/user/update-progit-address.dto';
import { UserRepository,  OtpRepository,  PurohitProfileRepository,  PurohitMediaRepository, CustomerFavoriteRepository, PlatformSettingRepository, CustomerAddressRepository, PurohitServiceAreaRepository, PurohitBankAccountRepository, } from '@likemyproduct/repositories';
import { PurohitProfile,  PurohitMedia,  PUROHIT_VERIFICATION_STATUS,  PUROHIT_MEDIA_TYPE,  User,  Otp,  USER_ROLE,  USER_STATUS, OTP_TYPE, BANK_VERIFICATION_STATUS, PurohitBankAccount } from '@likemyproduct/entities';
import { EmailService } from '@likemyproduct/email-services';
import { SmsService } from '@likemyproduct/sms-services';
import { UpdateUserDto, RegisterNormalUserDto,GenerateOtpDto,CustomerFavoriteDto } from '@likemyproduct/dtos';


@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly purohitProfileRepository: PurohitProfileRepository,
    private readonly customerFavoriteRepository: CustomerFavoriteRepository,
    private readonly dataSource: DataSource,
    private readonly s3Service: S3Service,
    private readonly platformSettingRepository: PlatformSettingRepository,
    private readonly customerAddressRepository: CustomerAddressRepository,
    private readonly purohitServiceAreaRepository: PurohitServiceAreaRepository,
    private readonly otpRepository: OtpRepository,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
    private readonly purohitMediaRepository: PurohitMediaRepository,
    private readonly purohitBankAccountRepository: PurohitBankAccountRepository,
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

    if (user.role === USER_ROLE.PUROHIT) {
      const profile = await this.purohitProfileRepository.findByUserId(
        Number(id),
      );

      if (!profile) {
        throw new NotFoundException('Purohit profile not found');
      }

      await this.purohitProfileRepository.update(profile.id, {
        bio: dto.bio,
        qualification: dto.qualification,
        experienceYears: dto.experienceYears,
        aadhaarNumber: dto.aadhaarNumber,
        city: dto.city,
        languages: dto.languages,
        specializations: dto.specializations,
        isOnlineAvailable:
          dto.isOnlineAvailable === undefined
            ? profile.isOnlineAvailable
            : dto.isOnlineAvailable === 'true',
        isOfflineAvailable:
          dto.isOfflineAvailable === undefined
            ? profile.isOfflineAvailable
            : dto.isOfflineAvailable === 'true',
      });
    }

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
    files: {
      profileImage?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
      templeAffiliationProof?: Express.Multer.File[];
    },
  )
   {
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

    if (files.profileImage?.length) {
      dto.profileImage = await this.s3Service.uploadFileHelper(
        id,
        'profileImage',
        files.profileImage,
      );
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

 async updateUserStatus(
    id: number,
    status: USER_STATUS,
  ) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cannot revert back to pending
    if (
      user.status !== USER_STATUS.PENDING &&
      status === USER_STATUS.PENDING
    ) {
      throw new BadRequestException(
        'User status cannot be changed back to PENDING',
      );
    }

    // Already in same status
    if (user.status === status) {
      throw new BadRequestException(
        `User is already ${status}`,
      );
    }

    user.status = status;

    // Logout user if blocked
    if (status === USER_STATUS.BLOCKED) {
      user.hashedRefreshToken = null;
      user.tokenVersion += 1;
    }

    await this.userRepository.save(user);

    return {
      success: true,
      message: `User status updated to ${status} successfully`,
    };
  }
  
  // async registerUser(dto: RegisterNormalUserDto) {
  //   return this.registerUserService(dto);
  // }

  async registerUser(
    dto: RegisterNormalUserDto,
    files: {
      aadhaarDoc?: Express.Multer.File[];
      panDoc?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
      templeAffiliationProof?: Express.Multer.File[];
      profileImage?: Express.Multer.File[];
    },
  ) {
    return this.registerUserService(dto, files);
  }

  async generateOtp(dto: GenerateOtpDto) {

    const { email, phone, role } = dto;

    if (
      ![USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ADMIN].includes(role)
    ) {
      throw new BadRequestException('Invalid role');
    }

    


    if (phone) {
      const existingUserByPhone = await this.userRepository.findOne({
        where: { phone },
      });

      if (existingUserByPhone) {
        throw new ConflictException('Phone number already in use');
      }
    } else if (email) {
      const existingUser = await this.userRepository.findByEmail(email);

      if (existingUser) {
        throw new ConflictException('User already exists');
      }
    } else {
      throw new BadRequestException('Email or phone number is required');
    }

    


   
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    let otpRecord;

    if (phone) {
      otpRecord = await this.otpRepository.findOne({
        where: { phone },
      });
    } else {
      otpRecord = await this.otpRepository.findOne({
        where: { email },
      });
    }

    

    if (otpRecord) {
      otpRecord.otp = otp;
      otpRecord.expiresAt = expiresAt;
      otpRecord.isVerified = false;
      otpRecord.role = role;
      otpRecord.otpType = OTP_TYPE.USER_REGISTRATION;

      if (phone) {
        otpRecord.phone = phone;
      } else {
        otpRecord.email = email;
      }
    } else {
        otpRecord = this.otpRepository.create({
          phone,
          email,
          otp,
          expiresAt,
          isVerified: false,
          role,
          otpType: OTP_TYPE.USER_REGISTRATION,
        });
      }

    await this.otpRepository.save(otpRecord);

  
    if (phone) {
     await this.smsService.sendOtpSms(phone, otp);
    } else if (email) {
      await this.emailService.sendOtpEmail(email, otp);
    }
    // }

    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }


  async upsertPlatformSetting(
    dto: UpsertPlatformSettingDto,
    userId: number,
  ) {
    const existingSetting = await this.platformSettingRepository.findOne({
      where: { key: dto.key },
    });

      if (existingSetting) {
        existingSetting.value = dto.value;
        existingSetting.description = dto.description;
        existingSetting.updatedById = userId;

        const updatedSetting =
          await this.platformSettingRepository.save(existingSetting);

        return {
          success: true,
          message: 'Platform setting updated successfully',
          data: updatedSetting,
        };
      }

      const newSetting = this.platformSettingRepository.create({
        ...dto,
        updatedById: userId,
      });

      const savedSetting = await this.platformSettingRepository.save(newSetting);

      return {
        success: true,
        message: 'Platform setting created successfully',
        data: savedSetting,
      };
    }

    async getPlatformSetting(userId: number) {
      const settings = await this.platformSettingRepository.findAndCount();

      return {
        success: true,
        message: 'Platform settings retrieved successfully',
        data: settings,
      };
    }


    async deletePlatformSetting(id: number, userId: number) {
      const setting = await this.platformSettingRepository.findOne({
        where: { id },
      });

      if (!setting) {
        throw new NotFoundException('Platform setting not found');
      }

      await this.platformSettingRepository.delete(id);

      return {
        success: true,
        message: 'Platform setting deleted successfully',
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

    async verifyOtp(phone: string, otp: string, email?: string) {
      let otpRecord;

      if (phone) {
        otpRecord = await this.otpRepository.findOne({
          where: { phone },
        });
      } else if (email) {
        otpRecord = await this.otpRepository.findOne({
          where: { email },
        });
      } else {
        throw new BadRequestException('Phone number or email is required');
      }

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
      // async updatePurohitStatus(id: string, status: USER_STATUS, rejectionReason?: string,) {
      //   const user = await this.userRepository.findById(id);

      //   if (!user) {
      //     throw new NotFoundException('User not found');
      //   }

      //     // if (user.status === USER_STATUS.BLOCKED) {
      //     //   throw new BadRequestException('User is already blocked');
      //     // }

      //     // user.status = USER_STATUS.BLOCKED;
      //     // user.hashedRefreshToken = null; // Invalidate existing refresh tokens
      //     // user.tokenVersion += 1; // Increment token version to invalidate existing tokens

      //     // await this.userRepository.save(user);

      //     // return {
      //     //     success: true,
      //     //     message: 'User blocked successfully',
      //     // };
      //     if (user.role !== USER_ROLE.PUROHIT) {
      //       throw new BadRequestException('Only Purohit status can be updated');
      //     }

      //     // Cannot change back to PENDING
      //     if (status === USER_STATUS.PENDING) {
      //       throw new BadRequestException(
      //         'Cannot change status back to PENDING',
      //       );
      //     }

      //     // Already in same status
      //     if (user.status === status) {
      //       throw new BadRequestException(`Purohit is already ${status}`);
      //     }

      //     if (
      //       status === USER_STATUS.REJECTED &&
      //       !rejectionReason?.trim()
      //     ) {
      //       throw new BadRequestException(
      //         'Rejection reason is required',
      //       );
      //     }

      //     // Allowed:
      //     // PENDING -> ACTIVE
      //     // PENDING -> REJECTED
      //     // ACTIVE -> REJECTED
      //     // REJECTED -> ACTIVE
      //     user.status = status;

      //     await this.userRepository.save(user);
      //     const existingProfile = await this.purohitProfileRepository.findOne({
      //       where: { userId: user.id },
      //     });

      //     if (!existingProfile) {
      //       throw new NotFoundException('Purohit profile not found');
      //     }

      //     if (status === USER_STATUS.ACTIVE) {
      //       existingProfile.verificationStatus =
      //         PUROHIT_VERIFICATION_STATUS.APPROVED;

      //       existingProfile.rejectionReason = undefined;
      //     }

      //     if (status === USER_STATUS.REJECTED) {
      //       existingProfile.verificationStatus =
      //         PUROHIT_VERIFICATION_STATUS.REJECTED;

      //       existingProfile.rejectionReason = rejectionReason;
      //     }

      //   await this.purohitProfileRepository.save(existingProfile);

      //   return {
      //     success: true,
      //     message: `Purohit status updated to ${status} successfully`,
      //   };
      // }

        async getApprovedPurohits(
          page = 1,
          limit = 10,
          search?: string,
        ) {
          const result = await this.userRepository.findApprovedPurohits(
            page,
            limit,
            search,
          );

          return {
            success: true,
            message: 'Purohits fetched successfully',
            ...result,
          };
        }
    
  async getApprovedPurohitById(id: number) {
    const user = await this.userRepository.findApprovedPurohitById(id);

    if (!user) {
      throw new NotFoundException('Purohit not found');
    }

    const profile = await this.purohitProfileRepository.findByUserId(id);

    return {
      success: true,
      message: 'Purohit fetched successfully',
      data: {
        id: user.id,
        profileImage: user.profileImage,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        phone: user.phone,
        dob: user.dob,
        birthPlace: user.birthPlace,
        bio: profile?.bio,
        qualification: profile?.qualification,
        experienceYears: profile?.experienceYears,
        avgRating: profile?.avgRating,
        totalReviews: profile?.totalReviews,
        isOnlineAvailable: profile?.isOnlineAvailable,
        isOfflineAvailable: profile?.isOfflineAvailable,
        languages: profile?.languages,
        specializations: profile?.specializations,
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
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


  async registerUserService(
    dto: RegisterNormalUserDto,
    files: {
      aadhaarDoc?: Express.Multer.File[];
      panDoc?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
      templeAffiliationProof?: Express.Multer.File[];
      profileImage?: Express.Multer.File[];
    },
  ) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        'At least email or phone number must be provided',
      );
    }

    // 1. Verify OTP record
    // const otpWhere: any[] = [];

    

    let otpRecord;

    if (dto.phone) {
      otpRecord = await this.otpRepository.findOne({
        where: {
          phone: dto.phone,
          isVerified: true,
        },
      });
    } else if (dto.email) {
      otpRecord = await this.otpRepository.findOne({
        where: {
          email: dto.email,
          isVerified: true,
        },
      });
    } else {
      throw new BadRequestException('Phone number or email is required');
    }
    

    // const otpRecord = await this.otpRepository.findOne({
    //   where: otpWhere,
    // });

    if (!otpRecord) {
      throw new BadRequestException('Please verify your OTP first');
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new BadRequestException('OTP has expired');
    }
    
    if (otpRecord.role === USER_ROLE.CUSTOMER) {
      if (dto.bio)
        throw new BadRequestException('bio is not allowed for CUSTOMER registration');

      if (dto.qualification)
        throw new BadRequestException('qualification is not allowed for CUSTOMER registration');

      if (dto.experienceYears !== undefined)
        throw new BadRequestException('experienceYears is not allowed for CUSTOMER registration');

      if (dto.aadhaarNumber)
        throw new BadRequestException('aadhaarNumber is not allowed for CUSTOMER registration');

      if (dto.city)
        throw new BadRequestException('city is not allowed for CUSTOMER registration');

      if (dto.languages?.length)
        throw new BadRequestException('languages are not allowed for CUSTOMER registration');

      if (dto.specializations?.length)
        throw new BadRequestException('specializations are not allowed for CUSTOMER registration');

      if (
        dto.accountHolderName ||
        dto.accountNumber ||
        dto.ifscCode ||
        dto.bankName ||
        dto.accountType
      ) {
        throw new BadRequestException(
          'Bank account details are not allowed for CUSTOMER registration',
        );
      }

      if (
        files.aadhaarDoc?.length ||
        files.panDoc?.length ||
        files.certificate?.length ||
        files.templeAffiliationProof?.length
      ) {
        throw new BadRequestException(
          'Purohit documents are not allowed for CUSTOMER registration',
        );
      }
    }
    
    if (otpRecord.role === USER_ROLE.PUROHIT) {
      const requiredFields = [
        'bio',
        'qualification',
        'experienceYears',
        'aadhaarNumber',
        'city',
        'languages',
        'isOnlineAvailable',
        'isOfflineAvailable',
        'specializations',
        'accountHolderName',
        'accountNumber',
        'ifscCode',
        'bankName',
        'accountType',
      ];

      for (const field of requiredFields) {
        const value = dto[field];

        if (
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim() === '') ||
          (Array.isArray(value) && value.length === 0)
        ) {
          throw new BadRequestException(
            `${field} is required for Purohit registration`,
          );
        }
      }

      if (!files.aadhaarDoc?.length && !dto.aadhaarDoc) {
        throw new BadRequestException(
          'Aadhaar document or URL is required',
        );
      }

      if (!files.panDoc?.length && !dto.panDoc) {
        throw new BadRequestException(
          'PAN document or URL is required',
        );
      }

      if (!files.certificate?.length && !dto.certificate) {
        throw new BadRequestException(
          'Certificate or URL is required',
        );
      }

      if (
        !files.templeAffiliationProof?.length &&
        !dto.templeAffiliationProof
      ) {
        throw new BadRequestException(
          'Temple affiliation proof or URL is required',
        );
}
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
    if (dto.username) {
    const existingUsername = await this.userRepository.findOne({
      where: { username: dto.username },
    });

    if (existingUsername) {
      throw new ConflictException('Username already in use');
    }
  }


    // 5. Check duplicate Aadhaar number (Purohit only)
      if (otpRecord.role === USER_ROLE.PUROHIT && dto.aadhaarNumber) {
        const existingAadhaar = await this.purohitProfileRepository.findOne({
          where: { aadhaarNumber: dto.aadhaarNumber },
        });

        if (existingAadhaar) {
          throw new ConflictException('Aadhaar number already in use');
        }
      }

      // 6. Check duplicate Bank Account number (Purohit only)
      if (otpRecord.role === USER_ROLE.PUROHIT && dto.accountNumber) {
        const existingAccount = await this.dataSource
          .getRepository(PurohitBankAccount)
          .findOne({ where: { accountNumber: dto.accountNumber } });

        if (existingAccount) {
          throw new ConflictException('Bank account number already in use');
        }
      }



     // Run database writes inside a transaction
    const savedUser = await this.dataSource.transaction(async (manager) => {
      // 5. Hash password and save user
      const hashedPassword = await bcrypt.hash(dto.password, 10);

      const username =
        dto.username ??
        `user${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const newUser = manager.create(User, {
        dob: dto.dob,
        birthPlace: dto.birthPlace,
        ...(dto.email && { email: dto.email.toLowerCase() }),
        username,
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

          const aadhaarDocUrl = files.aadhaarDoc?.length
      ? await this.s3Service.uploadFileHelper(
          saved.id,
          'aadhaarDoc',
          files.aadhaarDoc,
        )
      : dto.aadhaarDoc;

        const panDocUrl = files.panDoc?.length
          ? await this.s3Service.uploadFileHelper(
              saved.id,
              'panDoc',
              files.panDoc,
            )
          : dto.panDoc;

        const certificateUrl = files.certificate?.length
          ? await this.s3Service.uploadFileHelper(
              saved.id,
              'certificate',
              files.certificate,
            )
          : dto.certificate;

        const templeAffiliationProofUrl =
          files.templeAffiliationProof?.length
            ? await this.s3Service.uploadFileHelper(
                saved.id,
                'templeAffiliationProof',
                files.templeAffiliationProof,
              )
            : dto.templeAffiliationProof;

          const profileImageUrl = files.profileImage?.length
            ? await this.s3Service.uploadFileHelper(saved.id, 'profileImage', files.profileImage)
            : undefined;

          if (profileImageUrl) {
            await manager.update(User, saved.id, { profileImage: profileImageUrl });
            saved.profileImage = profileImageUrl;
          }

          if (otpRecord.role === USER_ROLE.PUROHIT) {
            const isOnlineAvailable =
              dto.isOnlineAvailable === 'true';

            const isOfflineAvailable =
              dto.isOfflineAvailable === 'true';
            const profile = manager.create(PurohitProfile, {
              profileImage: profileImageUrl,
              userId: saved.id,
              bio: dto.bio,
              qualification: dto.qualification,
              experienceYears: dto.experienceYears,
              aadhaarNumber: dto.aadhaarNumber,

              aadhaarDocUrl,
              panDocUrl,
              certificateUrl,
              templeAffiliationProofUrl,

              city: dto.city,
              languages: dto.languages,
              specializations: dto.specializations,
              isOnlineAvailable,
              isOfflineAvailable,
            });

            await manager.save(profile);

            await manager.save(
              manager.create(PurohitBankAccount, {
                purohitId: profile.id,
                accountHolderName: dto.accountHolderName!,
                accountNumber: dto.accountNumber!,
                ifscCode: dto.ifscCode!,
                bankName: dto.bankName!,
                accountType: dto.accountType!,
                isPrimary: true,
                verificationStatus: BANK_VERIFICATION_STATUS.PENDING,
              }),
            );

            await manager.save(PurohitMedia, [
              manager.create(PurohitMedia, {
                purohitId: profile.id,
                mediaType: PUROHIT_MEDIA_TYPE.IMAGE,
                documentType: 'AADHAAR',
                mediaUrl: aadhaarDocUrl!,
              }),

              manager.create(PurohitMedia, {
                purohitId: profile.id,
                mediaType: PUROHIT_MEDIA_TYPE.IMAGE,
                documentType: 'PAN',
                mediaUrl: panDocUrl!,
              }),

              manager.create(PurohitMedia, {
                purohitId: profile.id,
                mediaType: PUROHIT_MEDIA_TYPE.IMAGE,
                documentType: 'CERTIFICATE',
                mediaUrl: certificateUrl!,
              }),

              manager.create(PurohitMedia, {
                purohitId: profile.id,
                mediaType: PUROHIT_MEDIA_TYPE.IMAGE,
                documentType: 'TEMPLE_PROOF',
                mediaUrl: templeAffiliationProofUrl!,
              }),
            ]);
          }
    

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

  async addFavorite(
    customerId: number,
    dto: CustomerFavoriteDto,
  ) {
    const favorite = await this.customerFavoriteRepository.findFavorite(
      customerId,
      dto.purohitId,
    );

    if (favorite) {
      // Already active
      if (!favorite.deletedAt) {
        throw new ConflictException(
          'Purohit already added to favorites',
        );
      }

      // Restore soft-deleted favorite
      await this.customerFavoriteRepository.restoreFavorite(favorite.id);

      return {
        success: true,
        message: 'Purohit added to favorites successfully',
      };
    }

    await this.customerFavoriteRepository.createFavorite(
      customerId,
      dto.purohitId,
    );

    return {
      success: true,
      message: 'Purohit added to favorites successfully',
    };
  }

  async getMyFavorites(customerId: number) {
    const favorites =
      await this.customerFavoriteRepository.getFavoritesByCustomerId(
        customerId,
      );

    const data = favorites.map((favorite) => ({
      id: favorite.purohit.user.id,
      profileImage: favorite.purohit.user.profileImage,
      firstName: favorite.purohit.user.firstName,
      lastName: favorite.purohit.user.lastName,
      username: favorite.purohit.user.username,
      isActive: favorite.purohit.user.status === USER_STATUS.ACTIVE,
    }));

    return {
      success: true,
      message: 'Favorites fetched successfully',
      data,
    };
  }

  async removeFavorite(
    customerId: number,
    purohitId: number,
  ) {
    const favorite =
      await this.customerFavoriteRepository.removeFavorite(
        customerId,
        purohitId,
      );

    if (!favorite) {
      throw new NotFoundException(
        'Favorite not found',
      );
    }

    return {
      success: true,
      message: 'Favorite removed successfully',
    };
  }

}
