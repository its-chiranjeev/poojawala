import { CreatePurohitBankAccountDto, CreatePurohitByAdminDto, CreateCustomerByAdminDto, CustomerFavoriteDto, GenerateOtpDto, RegisterNormalUserDto, UpdatePurohitBankAccountDto, UpdateUserDto, VerifyPurohitDto } from '@poojawala/dtos';
import { UpsertPlatformSettingDto } from '@poojawala/dtos/Platform setting/Platform.dto';
import { CreateCustomerAddressDto } from '@poojawala/dtos/user/add-customer-address.dto';
import { UpdateCustomerAddressDto } from '@poojawala/dtos/user/update-customer-address.dto';
import { CreatePurohitServiceAreaDto } from '@poojawala/dtos/user/add-purohit-address.dto';
import { GetAllUsersDto } from '@poojawala/dtos/user/get-all-users.dto';
import { UpdatePurohitServiceAreaDto } from '@poojawala/dtos/user/update-purohit-address.dto';
import { EmailService } from '@poojawala/email-services';
import { BANK_VERIFICATION_STATUS, Otp, OTP_TYPE, PUROHIT_MEDIA_TYPE, PUROHIT_MEDIA_VERIFICATION_STATUS, PUROHIT_PAYMENT_METHOD, PUROHIT_VERIFICATION_STATUS, PurohitBankAccount, PurohitMedia, PurohitProfile, User, USER_ROLE, USER_STATUS, CustomerAddress } from '@poojawala/entities';
import { BookingRepository, CustomerAddressRepository, CustomerFavoriteRepository, OtpRepository, PlatformSettingRepository, PurohitBankAccountRepository, PurohitMediaRepository, PurohitProfileRepository, PurohitServiceAreaRepository, PurohitServiceRepository, UserRepository, } from '@poojawala/repositories';
import { S3Service } from '@poojawala/s3';
import { SmsService } from '@poojawala/sms-services';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AUDIT_MODULE, ACTOR_TYPE } from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';

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
    private readonly bookingRepository: BookingRepository,
    private readonly purohitServiceRepository: PurohitServiceRepository,
    private readonly auditLogService: AuditLogService,
  ) { }

  async deleteExpiredOtps(): Promise<number> {
    const result = await this.dataSource
      .getRepository(Otp)
      .createQueryBuilder()
      .delete()
      .from(Otp)
      .where('"expiresAt" <= NOW()')
      .execute();

    const affected = result.affected ?? 0;

    if (affected > 0) {
      await this.auditLogService.createAuditLog({
        actorType: ACTOR_TYPE.SYSTEM,
        module: AUDIT_MODULE.AUTH,
        entity: 'Otp',
        action: 'DELETE_EXPIRED_OTPS',
        message: `Deleted ${affected} expired OTP(s) via cron job`,
        metadata: { deletedCount: affected },
      });
    }

    return affected;
  }

  async updateProfileByAdmin(
    adminId: number,
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
      // phone: dto.phone,
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

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: id,
      action: 'USER_PROFILE_UPDATED',
      message: `Admin updated profile for User #${id}.`,
      oldValue: undefined,
      newValue: undefined,
    });

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

    if (dto.phone) {
      throw new BadRequestException('Phone number cannot be updated');
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

    if (files?.profileImage?.length) {
      dto.profileImage = await this.s3Service.uploadFileHelper(
        id,
        'profileImage',
        files.profileImage,
      );
    }

    if (files?.certificate?.length) {
      dto.certificate = await this.s3Service.uploadFileHelper(
        id,
        'certificate',
        files.certificate,
      );
    }

    if (files?.templeAffiliationProof?.length) {
      dto.templeAffiliationProof = await this.s3Service.uploadFileHelper(
        id,
        'templeAffiliationProof',
        files.templeAffiliationProof,
      );
    }

    const userPayload: Partial<User> = {
      email: dto.email,
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      profileImage: dto.profileImage,
      birthPlace: dto.birthPlace,
    };

    if (dto.dob) {
      userPayload.dob = new Date(dto.dob);
    }

    await this.userRepository.updateUser(id, userPayload);

    if (user.role === USER_ROLE.PUROHIT) {
      const profilePayload: any = {};
      if (dto.languages !== undefined) profilePayload.languages = dto.languages;
      if (dto.city !== undefined) profilePayload.city = dto.city;
      if (dto.specializations !== undefined) profilePayload.specializations = dto.specializations;
      if (dto.bio !== undefined) profilePayload.bio = dto.bio;
      if (dto.experienceYears !== undefined) profilePayload.experienceYears = dto.experienceYears;
      if (dto.qualification !== undefined) profilePayload.qualification = dto.qualification;
      if (dto.isOnlineAvailable !== undefined) profilePayload.isOnlineAvailable = dto.isOnlineAvailable === 'true' || dto.isOnlineAvailable === true as any;
      if (dto.isOfflineAvailable !== undefined) profilePayload.isOfflineAvailable = dto.isOfflineAvailable === 'true' || dto.isOfflineAvailable === true as any;

      if (Object.keys(profilePayload).length > 0) {
        const profile = await this.purohitProfileRepository.findOne({ where: { userId: Number(id) } });
        if (profile) {
          await this.purohitProfileRepository.update(profile.id, profilePayload);
        }
      }
    }

    const updatedUser = await this.userRepository.getFullProfile(Number(id), user.role);

    if (user.role === USER_ROLE.PUROHIT) {
      const profile = await this.purohitProfileRepository.findByUserId(
        Number(id),
      );

      if (profile) {
        await this.purohitProfileRepository.update(profile.id, {
          bio: dto.bio,
          qualification: dto.qualification,
          experienceYears: dto.experienceYears,
          aadhaarNumber: dto.aadhaarNumber,
          city: dto.city,
          languages: dto.languages,
          specializations: dto.specializations,
          ...(dto.certificate && { certificateUrl: dto.certificate }),
          ...(dto.templeAffiliationProof && {
            templeAffiliationProofUrl: dto.templeAffiliationProof,
          }),
          isOnlineAvailable:
            dto.isOnlineAvailable === undefined
              ? profile.isOnlineAvailable
              : String(dto.isOnlineAvailable) === 'true',
          isOfflineAvailable:
            dto.isOfflineAvailable === undefined
              ? profile.isOfflineAvailable
              : String(dto.isOfflineAvailable) === 'true',
        });
      }
    }

    const fullUser = await this.userRepository.getFullProfile(
      Number(id),
      user.role,
    );

    const { hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } =
      updatedUser as any;
    if (safeUser.profileImage) {
      try {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(
          safeUser.profileImage,
        );
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }

    // Also generate pre-signed URLs for documents if present in the profile
    if (safeUser.profile) {
      try {
        if (safeUser.profile.aadhaarDocUrl) safeUser.profile.aadhaarDocUrl = await this.s3Service.getDownloadUrl(safeUser.profile.aadhaarDocUrl);
        if (safeUser.profile.panDocUrl) safeUser.profile.panDocUrl = await this.s3Service.getDownloadUrl(safeUser.profile.panDocUrl);
        if (safeUser.profile.certificateUrl) safeUser.profile.certificateUrl = await this.s3Service.getDownloadUrl(safeUser.profile.certificateUrl);
        if (safeUser.profile.templeAffiliationProofUrl) safeUser.profile.templeAffiliationProofUrl = await this.s3Service.getDownloadUrl(safeUser.profile.templeAffiliationProofUrl);

        // Attach serviceRadiusKm from the default service area
        if (safeUser.serviceAreas && safeUser.serviceAreas.length > 0) {
          const defaultArea = safeUser.serviceAreas.find((a: any) => a.isDefault) || safeUser.serviceAreas[0];
          safeUser.profile.serviceRadiusKm = defaultArea.serviceRadiusKm;
        }
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profile documents:', e);
      }
    }

    await this.auditLogService.createAuditLog({
      actorId: Number(id),
      actorType: ACTOR_TYPE.USER,
      actorRole: user.role,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: id,
      action: 'USER_PROFILE_UPDATED',
      message: `User #${id} updated their own profile.`,
      oldValue: undefined,
      newValue: undefined,
    });

    return {
      success: true,
      message: 'Profile updated successfully',
      data: safeUser,
    };
  }

  async updateUserStatus(id: number, status: USER_STATUS, adminId: number) {
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

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: String(id),
      action: 'USER_STATUS_CHANGED',
      message: `User #${id} status changed to ${status}.`,
      oldValue: undefined,
      newValue: { status },
    });

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
      try {
        await this.smsService.sendOtpSms(phone, otp);
        this.logger.log(`OTP SMS sent successfully to ${phone}`);
      } catch (error: any) {
        this.logger.error(
          `Failed to send OTP SMS to ${phone}: ${error.message}`,
          error.stack,
        );
        if (email) {
          this.logger.log(`Falling back to email for OTP delivery to ${email}`);
          try {
            await this.emailService.sendOtpEmail(email, otp);
            this.logger.log(`Fallback OTP email sent successfully to ${email}`);
          } catch (emailError: any) {
            this.logger.error(
              `Failed to send fallback OTP email to ${email}: ${emailError.message}`,
              emailError.stack,
            );
            throw new InternalServerErrorException(
              'Failed to send OTP via SMS and fallback email delivery failed',
            );
          }
        } else {
          throw new InternalServerErrorException(
            'Failed to send OTP via SMS and no email provided for fallback',
          );
        }
      }
    } else if (email) {
      try {
        await this.emailService.sendOtpEmail(email, otp);
        this.logger.log(`OTP email sent successfully to ${email}`);
      } catch (emailError: any) {
        this.logger.error(
          `Failed to send OTP email to ${email}: ${emailError.message}`,
          emailError.stack,
        );
        throw new InternalServerErrorException('Failed to send OTP via email');
      }
    }
    // }

    return {
      success: true,
      message: 'OTP sent successfully',
      otp,
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
          if ((safeUser as any).purohitServices) {
            profile.purohitServices = await Promise.all((safeUser as any).purohitServices.map(async (ps: any) => {
              let iconDownloadurl: string | null = null;
              if (ps.service?.iconUrl) {
                try {
                  iconDownloadurl = await this.s3Service.getDownloadUrl(ps.service.iconUrl);
                } catch (e) { }
              }
              return {
                ...ps,
                service: {
                  ...ps.service,
                  iconDownloadurl
                }
              };
            }));
            delete (safeUser as any).purohitServices;
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

  async getApprovedPurohits(
    page = 1,
    limit = 10,
    search?: string,
    status?: USER_STATUS | string,
    isActive?: string | boolean,
    isOnlineAvailable?: string | boolean,
    isOfflineAvailable?: string | boolean,
  ) {
    const result = await this.userRepository.findApprovedPurohits(
      page,
      limit,
      search,
      status,
      isActive,
      isOnlineAvailable,
      isOfflineAvailable,
    );

    const dataWithServicesUrls = await Promise.all(result.data.map(async (user: any) => {
      let profileImage = user.profileImage;
      if (profileImage) {
        try {
          profileImage = await this.s3Service.getDownloadUrl(profileImage);
        } catch (e) { }
      }

      const purohitService = user.services ? user.services.map((ps: any) => {
        return {
          serviceName: ps.service?.name,
          isOnlinePrice: ps.onlinePrice,
          isOfflinePrice: ps.offlinePrice,
          isOnlineAvailable: ps.isOnline,
          isOfflineAvailable: ps.isOffline
        }
      }) : [];

      const isOnline = Boolean(
        user.profile?.isOnlineAvailable ??
        user.profile?.isonlineAvailable ??
        false,
      );
      const isOffline = Boolean(
        user.profile?.isOfflineAvailable ??
        user.profile?.isofflineAvailable ??
        false,
      );

      return {
        userId: user.id,
        purohitFirstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        profileImage,
        userRole: user.role,
        status: user.status,
        isActive: user.status === USER_STATUS.ACTIVE,
        isOnlineAvailable: isOnline,
        isOfflineAvailable: isOffline,
        bio: user.profile?.bio,
        qualification: user.profile?.qualification,
        averageRating: user.profile?.avgRating,
        experienceYears: user.profile?.experienceYears,
        languages: user.profile?.languages,
        specialization: user.profile?.specializations,
        city: user.profile?.city,
        purohitService,
      };
    }));

    return {
      success: true,
      message: 'Purohits fetched successfully',
      ...result,
      data: dataWithServicesUrls,
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

    const purohitService = profile?.purohitServices ? profile.purohitServices.map((ps) => {
      return {
        serviceName: ps.service?.name,
        isOnlinePrice: ps.onlinePrice,
        isOfflinePrice: ps.offlinePrice,
        isOnlineAvailable: ps.isOnline,
        isOfflineAvailable: ps.isOffline
      }
    }) : [];

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
        isActive: user.status === USER_STATUS.ACTIVE,
        isonlineAvailable: profile?.isOnlineAvailable,
        isofflineAvailable: profile?.isOfflineAvailable,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        purohitService,
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
        if ((safeUser as any).purohitServices) {
          profile.purohitServices = await Promise.all((safeUser as any).purohitServices.map(async (ps: any) => {
            let iconDownloadurl: string | null = null;
            if (ps.service?.iconUrl) {
              try {
                iconDownloadurl = await this.s3Service.getDownloadUrl(ps.service.iconUrl);
              } catch (e) { }
            }
            return {
              ...ps,
              service: {
                ...ps.service,
                iconDownloadurl
              }
            };
          }));
          delete (safeUser as any).purohitServices;
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

      const existingAddresses = await this.customerAddressRepository.find({
        where: { customerId: userId } as any,
      });

      let isDefault = dto.isDefault || false;

      if (existingAddresses.length === 0) {
        isDefault = true;
      } else if (isDefault) {
        await this.customerAddressRepository.clearDefaultAddress(userId);
      }

      const address = await this.customerAddressRepository.createAddress({
        customerId: userId,
        ...dto,
        isDefault,
      });

      await this.auditLogService.createAuditLog({
        actorId: userId,
        actorType: ACTOR_TYPE.USER,
        actorRole: user.role,
        module: AUDIT_MODULE.USER,
        entity: 'User',
        entityId: String(userId),
        action: 'CUSTOMER_ADDRESS_UPDATED',
        message: `Customer #${userId} added a new address #${address.id}.`,
        oldValue: undefined,
        newValue: { addressId: address.id },
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

  async getMyAddresses(
    userId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ) {
    const { data, total } = await this.customerAddressRepository.findAddresses(
      userId,
      page,
      limit,
      search,
    );

    return {
      success: true,
      message: 'Addresses fetched successfully',
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAddressById(userId: number, id: number) {
    const address = await this.customerAddressRepository.findById(id);

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.customerId !== userId) {
      throw new ForbiddenException('You can access only your own address');
    }

    return {
      success: true,
      message: 'Address fetched successfully',
      data: address,
    };
  }

  async updateAddress(userId: number, id: number, dto: UpdateCustomerAddressDto) {
    const address = await this.customerAddressRepository.findById(id);

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.customerId !== userId) {
      throw new ForbiddenException('You can update only your own address');
    }

    if (dto.isDefault) {
      await this.customerAddressRepository.clearDefaultAddress(userId);
    }

    const updated = await this.customerAddressRepository.update(id, dto);

    await this.auditLogService.createAuditLog({
      actorId: userId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.CUSTOMER,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: String(userId),
      action: 'CUSTOMER_ADDRESS_UPDATED',
      message: `Customer #${userId} updated address #${id}.`,
      oldValue: undefined,
      newValue: { addressId: id },
    });

    return {
      success: true,
      message: 'Address updated successfully',
      data: updated,
    };
  }

  async deleteAddress(userId: number, id: number) {
    const address = await this.customerAddressRepository.findById(id);

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.customerId !== userId) {
      throw new ForbiddenException('You can delete only your own address');
    }

    await this.customerAddressRepository.softDelete(id);

    await this.auditLogService.createAuditLog({
      actorId: userId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.CUSTOMER,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: String(userId),
      action: 'CUSTOMER_ADDRESS_UPDATED',
      message: `Customer #${userId} deleted address #${id}.`,
      oldValue: undefined,
      newValue: { addressId: id, deleted: true },
    });

    return {
      success: true,
      message: 'Address deleted successfully',
    };
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

    // if (existing) {
    //   throw new ConflictException(
    //     'Service area already exists for this pincode',
    //   );
    // }

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
    // if (dto.pincode) {
    //   const existing =
    //     await this.purohitServiceAreaRepository.findByPurohitAndPincode(
    //       userId,
    //       dto.pincode,
    //     );

    //   if (existing && existing.id !== id) {
    //     throw new ConflictException(
    //       'Service area already exists for this pincode',
    //     );
    //   }
    // }

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

  async getMyServiceAreas(
    userId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ) {
    const { data, total } =
      await this.purohitServiceAreaRepository.findServiceAreas(
        userId,
        page,
        limit,
        search,
      );

    return {
      success: true,
      message: 'Service areas fetched successfully',
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
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

    if (area.isDefault) {
      // Unset isDefault from the one being deleted
      await this.purohitServiceAreaRepository.updateArea(id, { isDefault: false });
    }

    await this.purohitServiceAreaRepository.deleteArea(id);

    // If the deleted area was the default one, make the next most recent one the default
    if (area.isDefault) {
      const remainingAreas = await this.purohitServiceAreaRepository.findByPurohitId(userId);
      if (remainingAreas.length > 0) {
        const nextDefaultArea = remainingAreas.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        await this.purohitServiceAreaRepository.updateArea(nextDefaultArea.id, { isDefault: true });
      }
    }

    return {
      success: true,
      message: 'Service area deleted successfully',
    };
  }

  async addPurohitBankAccount(userId: number, dto: CreatePurohitBankAccountDto) {
    const profile = await this.purohitProfileRepository.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Purohit profile not found');
    }

    if (dto.paymentMethod === PUROHIT_PAYMENT_METHOD.BANK) {
      if (!dto.accountHolderName || !dto.accountNumber || !dto.ifscCode) {
        throw new BadRequestException(
          'accountHolderName, accountNumber, and ifscCode are required for BANK payment method',
        );
      }
    } else if (dto.paymentMethod === PUROHIT_PAYMENT_METHOD.UPI) {
      if (!dto.upiId) {
        throw new BadRequestException(
          'upiId is required for UPI payment method',
        );
      }
    }

    if (dto.accountNumber) {
      const existingAccount = await this.purohitBankAccountRepository.findByAccountNumber(
        dto.accountNumber,
      );

      if (existingAccount) {
        throw new ConflictException('Bank account number already in use');
      }
    }

    const existingAccounts = await this.purohitBankAccountRepository.findByPurohitId(
      profile.id,
    );

    let isPrimary = false;
    if (dto.isPrimary !== undefined && dto.isPrimary !== null) {
      if (typeof dto.isPrimary === 'string') {
        isPrimary =
          (dto.isPrimary as string).trim().toLowerCase() === 'true' ||
          (dto.isPrimary as string) === '1';
      } else {
        isPrimary = Boolean(dto.isPrimary);
      }
    }

    if (existingAccounts.length === 0) {
      isPrimary = true;
    } else if (isPrimary) {
      await this.purohitBankAccountRepository.clearPrimaryAccount(profile.id);
    }

    const initialVerificationStatus =
      profile.verificationStatus === PUROHIT_VERIFICATION_STATUS.APPROVED
        ? BANK_VERIFICATION_STATUS.VERIFIED
        : BANK_VERIFICATION_STATUS.PENDING;

    const account = await this.purohitBankAccountRepository.createAccount({
      purohitId: profile.id,
      paymentMethod: dto.paymentMethod,
      accountHolderName: dto.accountHolderName,
      accountNumber: dto.accountNumber,
      ifscCode: dto.ifscCode,
      bankName: dto.bankName,
      accountType: dto.accountType,
      upiId: dto.upiId,
      isPrimary,
      verificationStatus: initialVerificationStatus,
    });

    await this.auditLogService.createAuditLog({
      actorId: userId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.PUROHIT,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: String(userId),
      action: 'PUROHIT_BANK_UPDATED',
      message: `Purohit #${userId} added a new bank account #${account.id}.`,
      oldValue: undefined,
      newValue: { bankAccountId: account.id },
    });

    return {
      success: true,
      message: 'Bank account added successfully',
      data: account,
    };
  }

  async getPurohitBankAccounts(
    userId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ) {
    const profile = await this.purohitProfileRepository.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Purohit profile not found');
    }

    const { data, total } = await this.purohitBankAccountRepository.findBankAccounts(
      profile.id,
      page,
      limit,
      search,
    );

    return {
      success: true,
      message: 'Bank accounts fetched successfully',
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPurohitBankAccountById(user: any, id: number) {
    const account = await this.purohitBankAccountRepository.findById(id);

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    if (user.role !== USER_ROLE.ADMIN) {
      const profile = await this.purohitProfileRepository.findOne({
        where: { userId: user.id },
      });

      if (!profile) {
        throw new NotFoundException('Purohit profile not found');
      }

      if (account.purohitId !== profile.id) {
        throw new ForbiddenException('You can access only your own bank account');
      }
    }

    return {
      success: true,
      message: 'Bank account fetched successfully',
      data: account,
    };
  }

  async updatePurohitBankAccount(
    userId: number,
    id: number,
    dto: UpdatePurohitBankAccountDto,
  ) {
    const profile = await this.purohitProfileRepository.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Purohit profile not found');
    }

    const account = await this.purohitBankAccountRepository.findById(id);

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    if (account.purohitId !== profile.id) {
      throw new ForbiddenException('You can update only your own bank account');
    }

    if (dto.accountNumber && dto.accountNumber !== account.accountNumber) {
      const existingAccount = await this.purohitBankAccountRepository.findByAccountNumber(
        dto.accountNumber,
      );

      if (existingAccount && existingAccount.id !== id) {
        throw new ConflictException('Bank account number already in use');
      }
    }

    let isPrimary: boolean | undefined = undefined;
    if (dto.isPrimary !== undefined && dto.isPrimary !== null) {
      const valStr = String(dto.isPrimary).trim().toLowerCase();
      isPrimary = valStr === 'true' || valStr === '1';
    }

    if (isPrimary === true) {
      await this.purohitBankAccountRepository.clearPrimaryAccount(profile.id);
    } else if (isPrimary === false && account.isPrimary) {
      const allAccounts = await this.purohitBankAccountRepository.findByPurohitId(
        profile.id,
      );
      const otherAccounts = allAccounts.filter((acc) => acc.id !== id);

      if (otherAccounts.length === 0) {
        throw new BadRequestException(
          'At least one bank account must remain primary',
        );
      }

      await this.purohitBankAccountRepository.updateAccount(otherAccounts[0].id, {
        isPrimary: true,
      });
    }

    const updatedData: Partial<PurohitBankAccount> = {
      ...dto,
      ...(isPrimary !== undefined && { isPrimary }),
      verificationStatus: BANK_VERIFICATION_STATUS.PENDING,
    };

    await this.purohitBankAccountRepository.updateAccount(
      id,
      updatedData,
    );

    const freshUpdatedAccount = await this.purohitBankAccountRepository.findById(id);

    await this.auditLogService.createAuditLog({
      actorId: userId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.PUROHIT,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: String(userId),
      action: 'PUROHIT_BANK_UPDATED',
      message: `Purohit #${userId} updated bank account #${id}.`,
      oldValue: undefined,
      newValue: { bankAccountId: id },
    });

    return {
      success: true,
      message: 'Bank account updated successfully',
      data: freshUpdatedAccount,
    };
  }

  async deletePurohitBankAccount(userId: number, id: number) {
    const profile = await this.purohitProfileRepository.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Purohit profile not found');
    }

    const account = await this.purohitBankAccountRepository.findById(id);

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    if (account.purohitId !== profile.id) {
      throw new ForbiddenException('You can delete only your own bank account');
    }

    const wasPrimary = account.isPrimary;

    await this.purohitBankAccountRepository.deleteAccount(id);

    if (wasPrimary) {
      const remainingAccounts = await this.purohitBankAccountRepository.findByPurohitId(
        profile.id,
      );

      if (remainingAccounts.length > 0) {
        await this.purohitBankAccountRepository.updateAccount(
          remainingAccounts[0].id,
          { isPrimary: true },
        );
      }
    }

    await this.auditLogService.createAuditLog({
      actorId: userId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.PUROHIT,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: String(userId),
      action: 'PUROHIT_BANK_UPDATED',
      message: `Purohit #${userId} deleted bank account #${id}.`,
      oldValue: undefined,
      newValue: { bankAccountId: id, deleted: true },
    });

    return {
      success: true,
      message: 'Bank account deleted successfully',
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
    const bankAccountRepository = manager.getRepository(PurohitBankAccount);

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

    await bankAccountRepository
      .createQueryBuilder()
      .update(PurohitBankAccount)
      .set({
        verificationStatus: BANK_VERIFICATION_STATUS.VERIFIED,
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
    const bankAccountRepository = manager.getRepository(PurohitBankAccount);

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

    await bankAccountRepository
      .createQueryBuilder()
      .update(PurohitBankAccount)
      .set({
        verificationStatus: BANK_VERIFICATION_STATUS.FAILED,
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
      const bankVerificationStatus =
        dto.status === PUROHIT_VERIFICATION_STATUS.APPROVED
          ? BANK_VERIFICATION_STATUS.VERIFIED
          : BANK_VERIFICATION_STATUS.FAILED;

      return {
        userId: purohitUser.id,
        profileId: profile.id,
        email: purohitUser.email,
        firstName: purohitUser.firstName,
        userStatus,
        verificationStatus: dto.status,
        mediaStatus,
        bankVerificationStatus,
        updatedMediaCount: media.length,
        rejectionReason:
          dto.status === PUROHIT_VERIFICATION_STATUS.REJECTED
            ? rejectionReason!
            : null,
      };
    });

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: String(purohitUserId),
      action: 'USER_STATUS_CHANGED',
      message: `Admin verified Purohit #${purohitUserId}. Status changed to ${dto.status}.`,
      oldValue: undefined,
      newValue: { status: dto.status, rejectionReason: dto.status === PUROHIT_VERIFICATION_STATUS.REJECTED ? rejectionReason : null },
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
        bankVerificationStatus: result.bankVerificationStatus,
        updatedMediaCount: result.updatedMediaCount,
        rejectionReason: result.rejectionReason,
        emailSent,
      },
    };
  }

  async createCustomerByAdmin(dto: CreateCustomerByAdminDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('At least email or phone number must be provided');
    }

    if (dto.phone) {
      const existingUserByPhone = await this.userRepository.findOne({
        where: { phone: dto.phone },
      });
      if (existingUserByPhone) throw new ConflictException('Phone number already in use');
    }

    if (dto.email) {
      const existingUserByEmail = await this.userRepository.findByEmail(dto.email);
      if (existingUserByEmail) throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const result = await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const addressRepository = manager.getRepository(CustomerAddress);

      const username = dto.firstName.replace(/\s+/g, '') + Math.floor(Math.random() * 1000);

      const user = userRepository.create({
        username,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        hashedPassword,
        role: USER_ROLE.CUSTOMER,
        status: USER_STATUS.ACTIVE,
        isAdminCreated: true,
      });

      const savedUser = await userRepository.save(user);

      if (dto.address || dto.city) {
        const address = addressRepository.create({
          customer: savedUser,
          fullAddress: dto.address || 'N/A',
          city: dto.city || 'N/A',
          pincode: '000000',
          addressLabel: 'HOME',
          isDefault: true,
        });
        await addressRepository.save(address);
      }

      return savedUser;
    });

    if (dto.email) {
      await this.emailService.sendCustomerCreatedByAdminEmail(
        dto.email,
        `${dto.firstName} ${dto.lastName || ''}`.trim(),
        dto.phone ?? 'N/A',
        dto.address ?? 'N/A',
        dto.city ?? 'N/A',
        dto.password
      );
    }

    return {
      success: true,
      message: 'Customer created successfully',
      data: result,
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
        dob: dto.dob ? new Date(dto.dob) : undefined,
      });

      const savedUser = await userRepository.save(user);

      const profile = manager.create(PurohitProfile, {
        userId: savedUser.id,
        verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
      });
      await manager.save(profile);

      return {
        user: savedUser,
        profile,
      };
    });

    if (dto.email) {
      await this.emailService.sendPurohitCreatedByAdminEmail(
        dto.email,
        `${dto.firstName} ${dto.lastName || ''}`.trim(),
        result.user.username,
        dto.phone ?? 'N/A',
        dto.password
      );
    }

    return {
      success: true,
      message: 'Purohit created successfully by admin',
      data: result,
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
    if (!dto.email && !dto.phone && !dto.id) {
      throw new BadRequestException(
        'At least email, phone number, or id must be provided',
      );
    }

    // 1. Verify OTP record
    // const otpWhere: any[] = [];

    let otpRecord: any;
    let existingAdminCreatedUser: User | null = null;

    if (dto.id) {
      existingAdminCreatedUser = await this.userRepository.findOne({ where: { id: dto.id } });
      if (!existingAdminCreatedUser) {
        throw new NotFoundException('Purohit not found');
      }
      if (existingAdminCreatedUser.role !== USER_ROLE.PUROHIT) {
        throw new BadRequestException('User is not a purohit');
      }
      otpRecord = { role: USER_ROLE.PUROHIT }; // Mock for the rest of the flow
    } else {
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
      }

      if (!otpRecord) {
        throw new BadRequestException('Please verify your OTP first');
      }

      if (otpRecord.expiresAt < new Date()) {
        throw new BadRequestException('OTP has expired');
      }
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

    if (!dto.id) {
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
      let saved: User;

      if (dto.id) {
        saved = existingAdminCreatedUser!;
        saved.isAdminCreated = false;
        await manager.save(User, saved);
      } else {
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
          status:
            otpRecord.role === USER_ROLE.PUROHIT
              ? USER_STATUS.PENDING
              : USER_STATUS.ACTIVE,
        });

        saved = await manager.save(User, newUser);
      }

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

        let profile = await manager.findOne(PurohitProfile, { where: { userId: saved.id } });

        if (profile) {
          Object.assign(profile, {
            bio: dto.bio ?? profile.bio,
            qualification: dto.qualification ?? profile.qualification,
            experienceYears: dto.experienceYears ?? profile.experienceYears,
            aadhaarNumber: dto.aadhaarNumber ?? profile.aadhaarNumber,
            aadhaarDocUrl: aadhaarDocUrl || profile.aadhaarDocUrl,
            panDocUrl: panDocUrl || profile.panDocUrl,
            certificateUrl: certificateUrl || profile.certificateUrl,
            templeAffiliationProofUrl: templeAffiliationProofUrl || profile.templeAffiliationProofUrl,
            city: dto.city ?? profile.city,
            languages: dto.languages ?? profile.languages,
            specializations: dto.specializations ?? profile.specializations,
            isOnlineAvailable: dto.isOnlineAvailable !== undefined ? isOnlineAvailable : profile.isOnlineAvailable,
            isOfflineAvailable: dto.isOfflineAvailable !== undefined ? isOfflineAvailable : profile.isOfflineAvailable,
          });
          await manager.save(profile);
        } else {
          profile = manager.create(PurohitProfile, {
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
        }

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

      // 6. Delete OTP record after verification (skip if bypassed via purohitId)
      if (otpRecord.id) {
        await manager.delete(Otp, { id: otpRecord.id });
      }

      await this.auditLogService.createAuditLog({
        actorId: saved.id,
        actorType: ACTOR_TYPE.USER,
        actorRole: saved.role,
        module: AUDIT_MODULE.USER,
        entity: 'User',
        entityId: String(saved.id),
        action: 'USER_REGISTERED',
        message: `User ${saved.username || saved.email || saved.phone} registered as ${saved.role}.`,
        oldValue: undefined,
        newValue: { role: saved.role, email: saved.email, phone: saved.phone },
      }, manager);

      return saved;
    });

    // 7. Send Registration Email to Customer or Purohit
    if (savedUser.email) {
      try {
        const fullName = savedUser.firstName
          ? `${savedUser.firstName} ${savedUser.lastName || ''}`.trim()
          : (savedUser.role === USER_ROLE.PUROHIT ? 'Purohit' : 'Devotee');

        if (savedUser.role === USER_ROLE.PUROHIT) {
          this.logger.log(`[UserRegistration] Sending registration email to Purohit ${savedUser.email}...`);
          await this.emailService.sendPurohitRegistrationEmail({
            email: savedUser.email,
            name: fullName,
            username: savedUser.username,
            phone: savedUser.phone,
          });
          this.logger.log(`[UserRegistration] Purohit registration email sent successfully to ${savedUser.email}.`);
        } else {
          this.logger.log(`[UserRegistration] Sending welcome registration email to customer ${savedUser.email}...`);
          await this.emailService.sendCustomerRegistrationEmail({
            email: savedUser.email,
            name: fullName,
            username: savedUser.username,
            phone: savedUser.phone,
          });
          this.logger.log(`[UserRegistration] Customer registration email sent successfully to ${savedUser.email}.`);
        }
      } catch (emailErr) {
        this.logger.error(
          `[UserRegistration] Failed to send registration email to ${savedUser.email}`,
          emailErr instanceof Error ? emailErr.stack : String(emailErr),
        );
      }
    }

    // 8. Issue Auth Tokens
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
        isAdminCreated: user.isAdminCreated,
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

  async scramblePhoneNumbers(phones?: string[]) {
    if (process.env['NODE_ENV'] === 'production') {
      this.logger.warn('Scramble phone cron skipped because environment is production');
      return;
    }

    const targetPhones = phones && phones.length > 0 ? phones : [
      '8468801711',
      '9358081535',
      '7082354083',
      '7668697182',
      '9354678205',
    ];

    for (const originalPhone of targetPhones) {
      const user = await this.userRepository.findOne({
        where: { phone: originalPhone }
      });

      if (user) {
        let newPhone = '';
        let isAlreadyUsed = true;

        while (isAlreadyUsed) {
          newPhone = this.generateRandomPhoneNumber();
          const existing = await this.userRepository.findOne({
            where: { phone: newPhone }
          });
          if (!existing) {
            isAlreadyUsed = false;
          }
        }

        user.phone = newPhone;
        if (user.username === originalPhone) {
          user.username = newPhone;
        }

        await this.userRepository.save(user);
        this.logger.log(`Successfully scrambled phone ${originalPhone} -> ${newPhone} for user ID ${user.id}`);
      }
    }
  }

  private generateRandomPhoneNumber(): string {
    const prefixes = ['9', '8', '7', '6'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    let rest = '';
    for (let i = 0; i < 9; i++) {
      rest += Math.floor(Math.random() * 10);
    }
    return prefix + rest;
  }

  async getPurohitDashboardStats(user: User) {
    if (user.role !== USER_ROLE.PUROHIT) {
      throw new ForbiddenException('Only purohits can access dashboard stats');
    }

    const purohitProfile = await this.purohitProfileRepository.findOne({
      where: { userId: user.id },
    });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    const bookingStats = await this.bookingRepository.getPurohitDashboardStats(purohitProfile.id);

    // Get total active services
    const totalActiveServices = await this.purohitServiceRepository.count({
      where: {
        purohitId: purohitProfile.id,
        isActive: true,
      },
    });

    return {
      ...bookingStats,
      totalActiveServices,
    };
  }

  async getCustomerDashboardStats(user: User) {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can access dashboard stats');
    }

    const bookingStats = await this.bookingRepository.getCustomerDashboardStats(user.id);

    return bookingStats;
  }

  async getAdminDashboardStats(user: User) {
    if (user.role !== USER_ROLE.ADMIN) {
      throw new ForbiddenException('Only admins can access dashboard stats');
    }

    const [bookingStats, activePurohits, activeCustomers] = await Promise.all([
      this.bookingRepository.getAdminDashboardStats(),
      this.userRepository.count({
        where: {
          role: USER_ROLE.PUROHIT,
          status: USER_STATUS.ACTIVE,
        },
      }),
      this.userRepository.count({
        where: {
          role: USER_ROLE.CUSTOMER,
          status: USER_STATUS.ACTIVE,
        },
      }),
    ]);

    return {
      totalRevenue: bookingStats.totalRevenue,
      totalBookings: bookingStats.totalBookings,
      activePurohits,
      activeCustomers,
    };
  }
}
