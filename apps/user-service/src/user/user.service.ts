import { CreatePurohitByAdminDto, CustomerFavoriteDto, GenerateOtpDto, RegisterNormalUserDto, UpdateUserDto, VerifyPurohitDto } from '@likemyproduct/dtos';
import { UpsertPlatformSettingDto } from '@likemyproduct/dtos/Platform setting/Platform.dto';
import { CreateCustomerAddressDto } from '@likemyproduct/dtos/user/add-customer-address.dto';
import { CreatePurohitServiceAreaDto } from '@likemyproduct/dtos/user/add-purohit-address.dto';
import { GetAllUsersDto } from '@likemyproduct/dtos/user/get-all-users.dto';
import { UpdatePurohitServiceAreaDto } from '@likemyproduct/dtos/user/update-purohit-address.dto';
import { EmailService } from '@likemyproduct/email-services';
import { BANK_VERIFICATION_STATUS, Otp, OTP_TYPE, PUROHIT_MEDIA_TYPE, PUROHIT_MEDIA_VERIFICATION_STATUS, PUROHIT_VERIFICATION_STATUS, PurohitBankAccount, PurohitMedia, PurohitProfile, User, USER_ROLE, USER_STATUS, } from '@likemyproduct/entities';
import { CustomerAddressRepository, CustomerFavoriteRepository, OtpRepository, PlatformSettingRepository, PurohitBankAccountRepository, PurohitMediaRepository, PurohitProfileRepository, PurohitServiceAreaRepository, UserRepository, } from '@likemyproduct/repositories';
import { S3Service } from '@likemyproduct/s3';
import { SmsService } from '@likemyproduct/sms-services';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly purohitProfileRepository: PurohitProfileRepository,
    private readonly customerFavoriteRepository: CustomerFavoriteRepository,
    private readonly dataSource: DataSource,
    private readonly s3Service: S3Service,
    private readonly platformSettingRepository: PlatformSettingRepository,
    private readonly customerAddressRepository: CustomerAddressRepository,
    private readonly purohitServiceAreaRepository: PurohitServiceAreaRepository,
    private readonly emailService: EmailService,
    private readonly otpRepository: OtpRepository,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
    private readonly purohitMediaRepository: PurohitMediaRepository,
    private readonly purohitBankAccountRepository: PurohitBankAccountRepository,
  ) {}

  async deleteExpiredOtps(): Promise<number> {
    const result = await this.dataSource
      .getRepository(Otp)
      .createQueryBuilder()
      .delete()
      .from(Otp)
      .where('"expiresAt" <= NOW()')
      .execute();

    return result.affected ?? 0;
  }

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

    const userPayload: Partial<User> = {
      email: dto.email,
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      profileImage: dto.profileImage,
      birthPlace: dto.birthPlace,
    };

    if (dto.dob) {
      userPayload.dob = new Date(dto.dob);
    }

    const updatedUser = await this.userRepository.updateUser(id, userPayload);

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

    const { hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } =
      updatedUser!;
    if (safeUser.profileImage) {
      try {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(
          safeUser.profileImage,
        );
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

    if (files.profileImage?.length) {
      dto.profileImage = await this.s3Service.uploadFileHelper(
        id,
        'profileImage',
        files.profileImage,
      );
    }

    const userPayload: Partial<User> = {
      email: dto.email,
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      profileImage: dto.profileImage,
      birthPlace: dto.birthPlace,
    };

    if (dto.dob) {
      userPayload.dob = new Date(dto.dob);
    }

    const updatedUser = await this.userRepository.updateUser(id, userPayload);

    const { hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } =
      updatedUser!;
    if (safeUser.profileImage) {
      try {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(
          safeUser.profileImage,
        );
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

  async updateUserStatus(id: number, status: USER_STATUS) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cannot revert back to pending
    if (user.status !== USER_STATUS.PENDING && status === USER_STATUS.PENDING) {
      throw new BadRequestException(
        'User status cannot be changed back to PENDING',
      );
    }

    // Already in same status
    if (user.status === status) {
      throw new BadRequestException(`User is already ${status}`);
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

  async upsertPlatformSetting(dto: UpsertPlatformSettingDto, userId: number) {
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
        if ((safeUser as any).profile) {
        const profile = { ...(safeUser as any).profile };
          if (profile.aadhaarDocUrl) {
            profile.aadhaarDocDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(profile.aadhaarDocUrl);
            profile.aadhaarDocUrl = await this.s3Service.getDownloadUrl(profile.aadhaarDocUrl);
          }
          if (profile.panDocUrl) {
            profile.panDocDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(profile.panDocUrl);
            profile.panDocUrl = await this.s3Service.getDownloadUrl(profile.panDocUrl);
          }
          if (profile.certificateUrl) {
            profile.certificateDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(profile.certificateUrl);
            profile.certificateUrl = await this.s3Service.getDownloadUrl(profile.certificateUrl);
          }
          if (profile.templeAffiliationProofUrl) {
            profile.templeAffiliationProofDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(profile.templeAffiliationProofUrl);
            profile.templeAffiliationProofUrl = await this.s3Service.getDownloadUrl(profile.templeAffiliationProofUrl);
          }
          (safeUser as any).profile = profile;
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

  async getApprovedPurohits(page = 1, limit = 10, search?: string) {
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
    let profileImage = user.profileImage;

    if (profileImage) {
      profileImage = await this.s3Service.getDownloadUrl(profileImage);
    }

    let aadhaarDocUrl = profile?.aadhaarDocUrl;
    let aadhaarDocDownloadUrl;
    if (aadhaarDocUrl) {
      aadhaarDocDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(aadhaarDocUrl);
      aadhaarDocUrl = await this.s3Service.getDownloadUrl(aadhaarDocUrl);
    }

    let panDocUrl = profile?.panDocUrl;
    let panDocDownloadUrl;
    if (panDocUrl) {
      panDocDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(panDocUrl);
      panDocUrl = await this.s3Service.getDownloadUrl(panDocUrl);
    }

    let certificateUrl = profile?.certificateUrl;
    let certificateDownloadUrl;
    if (certificateUrl) {
      certificateDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(certificateUrl);
      certificateUrl = await this.s3Service.getDownloadUrl(certificateUrl);
    }

    let templeAffiliationProofUrl = profile?.templeAffiliationProofUrl;
    let templeAffiliationProofDownloadUrl;
    if (templeAffiliationProofUrl) {
      templeAffiliationProofDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(templeAffiliationProofUrl);
      templeAffiliationProofUrl = await this.s3Service.getDownloadUrl(templeAffiliationProofUrl);
    }

    return {
      success: true,
      message: 'Purohit fetched successfully',
      data: {
        id: user.id,
        profileImage,
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
        aadhaarNumber: profile?.aadhaarNumber,
        aadhaarDocUrl,
        aadhaarDocDownloadUrl,
        panDocUrl,
        panDocDownloadUrl,
        certificateUrl,
        certificateDownloadUrl,
        templeAffiliationProofUrl,
        templeAffiliationProofDownloadUrl,
        verificationStatus: profile?.verificationStatus,
        rejectionReason: profile?.rejectionReason,
        city: profile?.city,
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
      const fullUser = await this.userRepository.getFullProfile(Number(id), user.role);
      const { hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } = fullUser!;

      if (safeUser.profileImage) {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(
          safeUser.profileImage,
        );
      }
      if ((safeUser as any).profile) {
        const profile = { ...(safeUser as any).profile };
        if (profile.aadhaarDocUrl) {
          profile.aadhaarDocDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(profile.aadhaarDocUrl);
          profile.aadhaarDocUrl = await this.s3Service.getDownloadUrl(profile.aadhaarDocUrl);
        }
        if (profile.panDocUrl) {
          profile.panDocDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(profile.panDocUrl);
          profile.panDocUrl = await this.s3Service.getDownloadUrl(profile.panDocUrl);
        }
        if (profile.certificateUrl) {
          profile.certificateDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(profile.certificateUrl);
          profile.certificateUrl = await this.s3Service.getDownloadUrl(profile.certificateUrl);
        }
        if (profile.templeAffiliationProofUrl) {
          profile.templeAffiliationProofDownloadUrl = await this.s3Service.getAttachmentDownloadUrl(profile.templeAffiliationProofUrl);
          profile.templeAffiliationProofUrl = await this.s3Service.getDownloadUrl(profile.templeAffiliationProofUrl);
        }
        (safeUser as any).profile = profile;
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

  private validatePurohitVerificationTransition(
    currentStatus: PUROHIT_VERIFICATION_STATUS,
    nextStatus: PUROHIT_VERIFICATION_STATUS,
  ): void {
    if (currentStatus === nextStatus) {
      return;
    }

    const allowedTransitions: Record<
      PUROHIT_VERIFICATION_STATUS,
      PUROHIT_VERIFICATION_STATUS[]
    > = {
      [PUROHIT_VERIFICATION_STATUS.PENDING]: [
        PUROHIT_VERIFICATION_STATUS.APPROVED,
        PUROHIT_VERIFICATION_STATUS.REJECTED,
      ],
      [PUROHIT_VERIFICATION_STATUS.APPROVED]: [
        PUROHIT_VERIFICATION_STATUS.REJECTED,
      ],
      [PUROHIT_VERIFICATION_STATUS.REJECTED]: [
        PUROHIT_VERIFICATION_STATUS.APPROVED,
      ],
    };

    const isAllowed = allowedTransitions[currentStatus]?.includes(nextStatus);

    if (!isAllowed) {
      throw new BadRequestException(
        `Purohit verification status cannot be changed from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  private isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === 'string') {
      return value.trim().length === 0;
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return false;
  }

  private validatePurohitForApproval(
    user: User,
    profile: PurohitProfile,
    media: PurohitMedia[],
  ): void {
    const requiredFields: Record<string, unknown> = {
      email: user.email,
      'first name': user.firstName,
      'Aadhaar number': profile.aadhaarNumber,
      'qualification certificate': profile.certificateUrl,
      qualification: profile.qualification,
      'experience years': profile.experienceYears,
      languages: profile.languages,
      specializations: profile.specializations,
      'Purohit media': media,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([, value]) => this.isEmptyValue(value))
      .map(([fieldName]) => fieldName);
      const hasAadhaar = !this.isEmptyValue(profile.aadhaarDocUrl);
      const hasPan = !this.isEmptyValue(profile.panDocUrl);

      if (!hasAadhaar && !hasPan) {
        missingFields.push('Aadhaar or PAN document');
      }

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Purohit cannot be approved. Missing required details: ${missingFields.join(', ')}`,
      );
    }
    this.validatePurohitMedia(media);
  }

  private validatePurohitMedia(media: PurohitMedia[]): void {
    const validMediaTypes = Object.values(PUROHIT_MEDIA_TYPE);

    const invalidMedia = media.find(
      ({ mediaUrl, mediaType }) =>
        !mediaUrl?.trim() || !validMediaTypes.includes(mediaType),
    );

    if (invalidMedia) {
      throw new BadRequestException(
        `Purohit media record ${invalidMedia.id} is invalid`,
      );
    }
  }

  private validateVerificationRequest(
    dto: VerifyPurohitDto,
  ): string | undefined {
    const rejectionReason = dto.rejectionReason?.trim();

    switch (dto.status) {
      case PUROHIT_VERIFICATION_STATUS.APPROVED:
        if (rejectionReason) {
          throw new BadRequestException(
            'Rejection reason cannot be provided while approving a Purohit',
          );
        }
        return undefined;

      case PUROHIT_VERIFICATION_STATUS.REJECTED:
        if (!rejectionReason) {
          throw new BadRequestException(
            'Rejection reason is required when rejecting a Purohit',
          );
        }
        return rejectionReason;

      default:
        throw new BadRequestException(
          'Admin can only approve or reject a Purohit',
        );
    }
  }

  private async approvePurohit(
    manager: EntityManager,
    userId: number,
    profileId: number,
  ): Promise<void> {
    const userRepository = manager.getRepository(User);
    const profileRepository = manager.getRepository(PurohitProfile);
    const mediaRepository = manager.getRepository(PurohitMedia);

    await userRepository
      .createQueryBuilder()
      .update(User)
      .set({
        status: USER_STATUS.ACTIVE,
        rejectionReason: () => 'NULL',
      })
      .where('id = :userId', { userId })
      .execute();

    await profileRepository
      .createQueryBuilder()
      .update(PurohitProfile)
      .set({
        verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
        rejectionReason: () => 'NULL',
      })
      .where('id = :profileId', { profileId })
      .execute();

    await mediaRepository
      .createQueryBuilder()
      .update(PurohitMedia)
      .set({
        verificationStatus: PUROHIT_MEDIA_VERIFICATION_STATUS.APPROVED,
        rejectionReason: () => 'NULL',
      })
      .where('"purohitId" = :profileId', {
        profileId,
      })
      .andWhere('"deletedAt" IS NULL')
      .execute();
  }

  private async rejectPurohit(
    manager: EntityManager,
    userId: number,
    profileId: number,
    rejectionReason: string,
  ): Promise<void> {
    const userRepository = manager.getRepository(User);
    const profileRepository = manager.getRepository(PurohitProfile);
    const mediaRepository = manager.getRepository(PurohitMedia);

    await userRepository.update(
      { id: userId },
      {
        status: USER_STATUS.REJECTED,
        rejectionReason,
      },
    );

    await profileRepository.update(
      { id: profileId },
      {
        verificationStatus: PUROHIT_VERIFICATION_STATUS.REJECTED,
        rejectionReason,
        isOnlineAvailable: false,
        isOfflineAvailable: false,
      },
    );

    await mediaRepository
      .createQueryBuilder()
      .update(PurohitMedia)
      .set({
        verificationStatus: PUROHIT_MEDIA_VERIFICATION_STATUS.REJECTED,
        rejectionReason,
      })
      .where('"purohitId" = :profileId', {
        profileId,
      })
      .andWhere('"deletedAt" IS NULL')
      .execute();
  }

  private async sendPurohitVerificationEmail(result: {
    userId: number;
    email?: string | null;
    firstName?: string | null;
    verificationStatus: PUROHIT_VERIFICATION_STATUS;
    rejectionReason: string | null;
  }): Promise<boolean> {
    const recipientEmail = result.email?.trim();

    this.logger.log(
      `Preparing verification email: ${JSON.stringify({
        userId: result.userId,
        email: recipientEmail,
        status: result.verificationStatus,
      })}`,
    );

    if (!recipientEmail) {
      throw new BadRequestException(
        `Purohit user ${result.userId} does not have a valid email`,
      );
    }

    switch (result.verificationStatus) {
      case PUROHIT_VERIFICATION_STATUS.APPROVED:
        await this.emailService.sendPurohitApprovalEmail(
          recipientEmail,
          result.firstName ?? undefined,
        );
        break;

      case PUROHIT_VERIFICATION_STATUS.REJECTED:
        if (!result.rejectionReason) {
          throw new BadRequestException(
            'Rejection reason is required for rejection email',
          );
        }

        await this.emailService.sendPurohitRejectionEmail(
          recipientEmail,
          result.rejectionReason,
          result.firstName ?? undefined,
        );
        break;

      default:
        throw new BadRequestException(
          'Unsupported Purohit verification status',
        );
    }

    this.logger.log(
      `Verification email sent successfully to ${recipientEmail}`,
    );

    return true;
  }

  async verifyPurohitByAdmin(
    adminId: number,
    purohitUserId: number,
    dto: VerifyPurohitDto,
  ) {
    const rejectionReason = this.validateVerificationRequest(dto);

    const result = await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const profileRepository = manager.getRepository(PurohitProfile);
      const mediaRepository = manager.getRepository(PurohitMedia);
      const admin = await userRepository.findOne({
        where: {
          id: adminId,
          role: USER_ROLE.ADMIN,
          status: USER_STATUS.ACTIVE,
        },
      });

      if (!admin) {
        throw new ForbiddenException(
          'Only an active admin can verify a Purohit',
        );
      }

      const purohitUser = await userRepository
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :purohitUserId', {
          purohitUserId,
        })
        .getOne();

      if (!purohitUser) {
        throw new NotFoundException('Purohit user not found');
      }

      if (purohitUser.role !== USER_ROLE.PUROHIT) {
        throw new BadRequestException('The selected user is not a Purohit');
      }

      const profile = await profileRepository
        .createQueryBuilder('profile')
        .setLock('pessimistic_write')
        .where('profile.userId = :purohitUserId', {
          purohitUserId,
        })
        .getOne();

      if (!profile) {
        throw new NotFoundException('Purohit profile not found');
      }

      const media = await mediaRepository.find({
        where: {
          purohitId: profile.id,
        },
        order: {
          displayOrder: 'ASC',
          createdAt: 'ASC',
        },
      });

      this.validatePurohitVerificationTransition(
        profile.verificationStatus,
        dto.status,
      );

      switch (dto.status) {
        case PUROHIT_VERIFICATION_STATUS.APPROVED:
          this.validatePurohitForApproval(purohitUser, profile, media);

          await this.approvePurohit(manager, purohitUser.id, profile.id);
          break;

        case PUROHIT_VERIFICATION_STATUS.REJECTED:
          await this.rejectPurohit(
            manager,
            purohitUser.id,
            profile.id,
            rejectionReason!,
          );
          break;

        default:
          throw new BadRequestException('Invalid Purohit verification status');
      }

      const userStatus =
        dto.status === PUROHIT_VERIFICATION_STATUS.APPROVED
          ? USER_STATUS.ACTIVE
          : USER_STATUS.REJECTED;
      const mediaStatus =
        dto.status === PUROHIT_VERIFICATION_STATUS.APPROVED
          ? PUROHIT_MEDIA_VERIFICATION_STATUS.APPROVED
          : PUROHIT_MEDIA_VERIFICATION_STATUS.REJECTED;

      return {
        userId: purohitUser.id,
        profileId: profile.id,
        email: purohitUser.email,
        firstName: purohitUser.firstName,
        userStatus,
        verificationStatus: dto.status,
        mediaStatus,
        updatedMediaCount: media.length,
        rejectionReason:
          dto.status === PUROHIT_VERIFICATION_STATUS.REJECTED
            ? rejectionReason!
            : null,
      };
    });

    const emailSent = await this.sendPurohitVerificationEmail(result);

    const isApproved =
      result.verificationStatus === PUROHIT_VERIFICATION_STATUS.APPROVED;

    return {
      success: true,
      message: isApproved
        ? 'Purohit approved successfully'
        : 'Purohit rejected successfully',
      data: {
        userId: result.userId,
        profileId: result.profileId,
        userStatus: result.userStatus,
        verificationStatus: result.verificationStatus,
        mediaStatus: result.mediaStatus,
        updatedMediaCount: result.updatedMediaCount,
        rejectionReason: result.rejectionReason,
        emailSent,
      },
    };
  }

  async createPurohitByAdmin(dto: CreatePurohitByAdminDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        'At least email or phone number must be provided',
      );
    }

    if (dto.phone) {
      const existingUserByPhone = await this.userRepository.findOne({
        where: { phone: dto.phone },
      });
      if (existingUserByPhone)
        throw new ConflictException('Phone number already in use');
    }
    if (dto.email) {
      const existingUserByEmail = await this.userRepository.findByEmail(
        dto.email,
      );
      if (existingUserByEmail)
        throw new ConflictException('Email already in use');
    }

    const bcrypt = require('bcryptjs'); // Assuming bcrypt is used for password hashing, using require to avoid import issues
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const result = await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);

      const username =
        dto.firstName.replace(/\s+/g, '') + Math.floor(Math.random() * 1000);

      const user = userRepository.create({
        username,
        email: dto.email,
        phone: dto.phone,
        countryCode: dto.countryCode,
        hashedPassword,
        role: USER_ROLE.PUROHIT,
        firstName: dto.firstName,
        lastName: dto.lastName,
        status: USER_STATUS.PENDING,
        isAdminCreated: true,
      });

      const savedUser = await userRepository.save(user);

      return {
        user: savedUser,
        message: 'Purohit created successfully by admin',
      };
    });

    return result;
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
        throw new BadRequestException(
          'bio is not allowed for CUSTOMER registration',
        );

      if (dto.qualification)
        throw new BadRequestException(
          'qualification is not allowed for CUSTOMER registration',
        );

      if (dto.experienceYears !== undefined)
        throw new BadRequestException(
          'experienceYears is not allowed for CUSTOMER registration',
        );

      if (dto.aadhaarNumber)
        throw new BadRequestException(
          'aadhaarNumber is not allowed for CUSTOMER registration',
        );

      if (dto.city)
        throw new BadRequestException(
          'city is not allowed for CUSTOMER registration',
        );

      if (dto.languages?.length)
        throw new BadRequestException(
          'languages are not allowed for CUSTOMER registration',
        );

      if (dto.specializations?.length)
        throw new BadRequestException(
          'specializations are not allowed for CUSTOMER registration',
        );

      if (
        dto.accountHolderName ||
        dto.accountNumber ||
        dto.ifscCode ||
        dto.bankName ||
        dto.paymentMethod ||
        dto.upiId
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
        'paymentMethod',
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

      if (dto.paymentMethod === 'BANK') {
        const bankFields = [
          'accountHolderName',
          'accountNumber',
          'ifscCode',
          'bankName',
        ];
        for (const field of bankFields) {
          const value = dto[field];
          if (!value || (typeof value === 'string' && value.trim() === '')) {
            throw new BadRequestException(
              `${field} is required when payment method is BANK`,
            );
          }
        }
      } else if (dto.paymentMethod === 'UPI') {
        if (!dto.upiId || dto.upiId.trim() === '') {
          throw new BadRequestException(
            'UPI ID is required when payment method is UPI',
          );
        }
      } else {
        throw new BadRequestException('Invalid payment method');
      }

      const hasAadhaar = files.aadhaarDoc?.length || dto.aadhaarDoc;
      const hasPan = files.panDoc?.length || dto.panDoc;

      if (!hasAadhaar && !hasPan) {
        throw new BadRequestException(
          'Either Aadhaar or PAN document is required',
        );
      }

      if (!files.certificate?.length && !dto.certificate) {
        throw new BadRequestException('Certificate or URL is required');
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
      const existingUserByEmail = await this.userRepository.findByEmail(
        dto.email,
      );
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
        dto.username ?? `user${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const newUser = manager.create(User, {
        dob: dto.dob,
        birthPlace: dto.birthPlace,
        ...(dto.email && { email: dto.email.toLowerCase() }),
        username,
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.countryCode && { countryCode: dto.countryCode }),
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

      const templeAffiliationProofUrl = files.templeAffiliationProof?.length
        ? await this.s3Service.uploadFileHelper(
            saved.id,
            'templeAffiliationProof',
            files.templeAffiliationProof,
          )
        : dto.templeAffiliationProof;

      const profileImageUrl = files.profileImage?.length
        ? await this.s3Service.uploadFileHelper(
            saved.id,
            'profileImage',
            files.profileImage,
          )
        : undefined;

      if (profileImageUrl) {
        await manager.update(User, saved.id, { profileImage: profileImageUrl });
        saved.profileImage = profileImageUrl;
      }

      if (otpRecord.role === USER_ROLE.PUROHIT) {
        const missingDocs: string[] = [];
        if (!aadhaarDocUrl && !panDocUrl)
          missingDocs.push('Aadhaar or PAN document');
        if (!certificateUrl) missingDocs.push('Certificate');
        if (!templeAffiliationProofUrl)
          missingDocs.push('Temple affiliation proof');

        if (missingDocs.length > 0) {
          throw new BadRequestException(
            `Please provide all required images. Missing: ${missingDocs.join(', ')}`,
          );
        }

        const isOnlineAvailable = dto.isOnlineAvailable === 'true';

        const isOfflineAvailable = dto.isOfflineAvailable === 'true';
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

        const bankAccountData: any = {
          purohitId: profile.id,
          paymentMethod: dto.paymentMethod,
          isPrimary: true,
          verificationStatus: BANK_VERIFICATION_STATUS.PENDING,
        };

        if (dto.paymentMethod === 'BANK') {
          bankAccountData.accountHolderName = dto.accountHolderName;
          bankAccountData.accountNumber = dto.accountNumber;
          bankAccountData.ifscCode = dto.ifscCode;
          bankAccountData.bankName = dto.bankName;
        } else if (dto.paymentMethod === 'UPI') {
          bankAccountData.upiId = dto.upiId;
        }

        await manager.save(manager.create(PurohitBankAccount, bankAccountData));

        const mediaEntries: PurohitMedia[] = [];
        if (aadhaarDocUrl) {
          mediaEntries.push(
            manager.create(PurohitMedia, {
              purohitId: profile.id,
              mediaType: PUROHIT_MEDIA_TYPE.IMAGE,
              documentType: 'AADHAAR',
              mediaUrl: aadhaarDocUrl,
            }),
          );
        }

        if (panDocUrl) {
          mediaEntries.push(
            manager.create(PurohitMedia, {
              purohitId: profile.id,
              mediaType: PUROHIT_MEDIA_TYPE.IMAGE,
              documentType: 'PAN',
              mediaUrl: panDocUrl,
            }),
          );
        }

        if (certificateUrl) {
          mediaEntries.push(
            manager.create(PurohitMedia, {
              purohitId: profile.id,
              mediaType: PUROHIT_MEDIA_TYPE.IMAGE,
              documentType: 'CERTIFICATE',
              mediaUrl: certificateUrl,
            }),
          );
        }

        if (templeAffiliationProofUrl) {
          mediaEntries.push(
            manager.create(PurohitMedia, {
              purohitId: profile.id,
              mediaType: PUROHIT_MEDIA_TYPE.IMAGE,
              documentType: 'TEMPLE_PROOF',
              mediaUrl: templeAffiliationProofUrl,
            }),
          );
        }

        if (mediaEntries.length > 0) {
          await manager.save(PurohitMedia, mediaEntries);
        }
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

  async addFavorite(customerId: number, dto: CustomerFavoriteDto) {
    const favorite = await this.customerFavoriteRepository.findFavorite(
      customerId,
      dto.purohitId,
    );

    if (favorite) {
      // Already active
      if (!favorite.deletedAt) {
        throw new ConflictException('Purohit already added to favorites');
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

  async removeFavorite(customerId: number, purohitId: number) {
    const favorite = await this.customerFavoriteRepository.removeFavorite(
      customerId,
      purohitId,
    );

    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }

    return {
      success: true,
      message: 'Favorite removed successfully',
    };
  }
}
