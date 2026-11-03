import {
  CreateBankAccountDto,
  CreatePurohitByAdminDto,
  CreateAstrologerByAdminDto,
  CreateCustomerByAdminDto,
  CustomerFavoriteDto,
  GenerateOtpDto,
  RegisterNormalUserDto,
  UpdateBankAccountDto,
  UpdateUserDto,
  VerifyPurohitDto,
  parseIntArray,
  parseStringArray,
} from '@poojawala/dtos';
import { UpsertPlatformSettingDto } from '@poojawala/dtos/Platform setting/Platform.dto';
import { CreateCustomerAddressDto } from '@poojawala/dtos/user/add-customer-address.dto';
import { UpdateCustomerAddressDto } from '@poojawala/dtos/user/update-customer-address.dto';
import { CreatePurohitServiceAreaDto } from '@poojawala/dtos/user/add-purohit-address.dto';
import { GetAllUsersDto } from '@poojawala/dtos/user/get-all-users.dto';
import { UpdatePurohitServiceAreaDto } from '@poojawala/dtos/user/update-purohit-address.dto';
import { EmailService } from '@poojawala/email-services';
import {
  BANK_VERIFICATION_STATUS,
  Otp,
  OTP_TYPE,
  PUROHIT_MEDIA_TYPE,
  PUROHIT_MEDIA_VERIFICATION_STATUS,
  PUROHIT_PAYMENT_METHOD,
  PUROHIT_VERIFICATION_STATUS,
  BankAccount,
  PurohitMedia,
  PurohitProfile,
  PurohitServiceArea,
  AstrologerProfile,
  User,
  USER_ROLE,
  USER_STATUS,
  CustomerAddress,
  Service,
  PurohitService,
  VENUE_TYPE,
  NOTIFICATION_TYPE,
  Order,
  ORDER_STATUS,
  ORDER_PAYMENT_STATUS,
  PLATFORM_SETTING_KEY,
} from '@poojawala/entities';
import { NotificationService } from '@poojawala/notification';
import {
  BookingRepository,
  CustomerAddressRepository,
  CustomerFavoriteRepository,
  OtpRepository,
  PlatformSettingRepository,
  BankAccountRepository,
  PurohitMediaRepository,
  PurohitProfileRepository,
  PurohitServiceAreaRepository,
  PurohitServiceRepository,
  UserRepository,
  OrderRepository,
} from '@poojawala/repositories';
import { S3Service } from '@poojawala/s3';
import { SmsService } from '@poojawala/sms-services';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import { DataSource, EntityManager, In, DeepPartial } from 'typeorm';
import { AUDIT_MODULE, ACTOR_TYPE } from '@poojawala/entities';
import {
  AuditLogService,
  generateSecureOtp,
  hashOtp,
  verifyOtpHash,
  DEFAULT_OTP_EXPIRY_SECONDS,
  MAX_OTP_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  getPlatformLogoUrl,
} from '@poojawala/common';
import * as path from 'path';

const ADVISORY_LOCK_NAMESPACE = {
  CUSTOMER_ADDRESS: 1001,
  PUROHIT_SERVICE_AREA: 1002,
  PUROHIT_BANK_ACCOUNT: 1003,
} as const;

// Verhoeff multiplication table
const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

// Verhoeff permutation table
const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/**
 * Validates Aadhaar number using Verhoeff algorithm.
 * Accepts "234567890124", "2345 6789 0124" or "2345-6789-0124".
 */
export function isValidAadhaar(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const num = value.replace(/[\s-]/g, '');

  // 12 digits, first digit cannot be 0 or 1
  if (!/^[2-9]\d{11}$/.test(num)) return false;

  let c = 0;
  const digits = num.split('').reverse();
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(digits[i])]];
  }
  return c === 0;
}

export interface ProfileCompletenessCheckData {
  role: USER_ROLE.PUROHIT | USER_ROLE.ASTROLOGER;
  user: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  profile: {
    city?: string | null;
    state?: string | null;
    bio?: string | null;
    qualification?: string[] | string | null;
    education?: string[] | string | null;
    aadhaarDocUrl?: string | null;
    panDocUrl?: string | null;
    certificateUrl?: string | null;
  };
  bankAccount?: {
    accountNumber?: string | null;
    ifscCode?: string | null;
    accountHolderName?: string | null;
    upiId?: string | null;
  } | null;
  serviceAreas?: Array<{ city?: string; addressLabel?: string; id?: number }> | string[] | null;
}

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
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly bookingRepository: BookingRepository,
    private readonly purohitServiceRepository: PurohitServiceRepository,
    private readonly auditLogService: AuditLogService,
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly orderRepository?: OrderRepository,
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
    files?: {
      profileImage?: Express.Multer.File[];
      aadhaarDoc?: Express.Multer.File[];
      panDoc?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
      templeAffiliationProof?: Express.Multer.File[];
    } | Express.Multer.File,
  ) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let profile: PurohitProfile | null = null;
    let astrologerProfile: AstrologerProfile | null = null;
    let uniqueServiceIds: number[] | undefined;
    let uniqueAreaNames: string[] | undefined;

    if (user.role === USER_ROLE.PUROHIT) {
      profile = await this.purohitProfileRepository.findByUserId(
        Number(id),
      );

      if (!profile) {
        throw new NotFoundException('Purohit profile not found');
      }

      const rawServices =
        dto.services !== undefined
          ? dto.services
          : dto.purohitServices !== undefined
            ? dto.purohitServices
            : dto.profile?.services !== undefined
              ? dto.profile.services
              : dto.profile?.purohitServices !== undefined
                ? dto.profile.purohitServices
                : undefined;

      if (rawServices !== undefined) {
        const parsedServices = parseIntArray(rawServices) || [];
        uniqueServiceIds = Array.from(new Set(parsedServices));
        if (uniqueServiceIds.length > 0) {
          const serviceRepo = this.dataSource.getRepository(Service);
          const foundServices = await serviceRepo.find({
            where: { id: In(uniqueServiceIds) },
          });
          if (foundServices.length !== uniqueServiceIds.length) {
            const foundSet = new Set(foundServices.map((s) => s.id));
            const missing = uniqueServiceIds.filter((sId) => !foundSet.has(sId));
            throw new NotFoundException(`Services not found: ${missing.join(', ')}`);
          }
        }
      }

      const rawServiceAreas =
        dto.serviceAreas !== undefined
          ? dto.serviceAreas
          : dto.profile?.serviceAreas !== undefined
            ? dto.profile.serviceAreas
            : undefined;

      if (rawServiceAreas !== undefined) {
        const parsedAreas = parseStringArray(rawServiceAreas) || [];
        uniqueAreaNames = Array.from(
          new Set(parsedAreas.map((a) => String(a).trim()).filter(Boolean)),
        );
      }
    } else if (user.role === USER_ROLE.ASTROLOGER) {
      const astrologerRepo = this.dataSource.getRepository(AstrologerProfile);
      astrologerProfile = await astrologerRepo.findOne({
        where: { userId: Number(id) },
      });

      if (!astrologerProfile) {
        astrologerProfile = astrologerRepo.create({
          userId: Number(id),
          verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
        });
        astrologerProfile = await astrologerRepo.save(astrologerProfile);
      }
    }

    if (dto.password) {
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      (dto as any).hashedPassword = hashedPassword;
      delete dto.password;
      delete dto.confirmPassword;
    }

    const profileImageFile =
      (files as any)?.profileImage?.[0] ||
      (files && (files as any).fieldname === 'profileImage'
        ? (files as Express.Multer.File)
        : undefined);

    const oldProfileImage = user.profileImage;
    if (profileImageFile && profileImageFile.buffer && profileImageFile.buffer.length > 0) {
      const imageUrl = await this.s3Service.uploadProfileImage(
        id,
        profileImageFile,
      );
      dto.profileImage = imageUrl;

      // Delete old profile image if it was a Vercel Blob URL
      if (
        oldProfileImage &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldProfileImage) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldProfileImage);
      }
    } else if (typeof dto.profileImage === 'string' && dto.profileImage.trim().length > 0) {
      dto.profileImage = dto.profileImage.trim();
    } else {
      dto.profileImage = null as any;
      if (
        oldProfileImage &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldProfileImage) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldProfileImage);
      }
    }

    const aadhaarFiles = (files as any)?.aadhaarDoc?.filter(
      (f: Express.Multer.File) => f && f.buffer && f.buffer.length > 0,
    );
    if (aadhaarFiles?.length) {
      dto.aadhaarDoc = await this.s3Service.uploadFileHelper(
        id,
        'aadhaarDoc',
        aadhaarFiles,
      );
    }

    const panFiles = (files as any)?.panDoc?.filter(
      (f: Express.Multer.File) => f && f.buffer && f.buffer.length > 0,
    );
    if (panFiles?.length) {
      dto.panDoc = await this.s3Service.uploadFileHelper(
        id,
        'panDoc',
        panFiles,
      );
    }

    const certificateFiles = (files as any)?.certificate?.filter(
      (f: Express.Multer.File) => f && f.buffer && f.buffer.length > 0,
    );
    if (certificateFiles?.length) {
      dto.certificate = await this.s3Service.uploadFileHelper(
        id,
        'certificate',
        certificateFiles,
      );
    }

    const templeFiles = (files as any)?.templeAffiliationProof?.filter(
      (f: Express.Multer.File) => f && f.buffer && f.buffer.length > 0,
    );
    if (templeFiles?.length) {
      dto.templeAffiliationProof = await this.s3Service.uploadFileHelper(
        id,
        'templeAffiliationProof',
        templeFiles,
      );
    }

    const userPayload: Partial<User> = {
      email: dto.email,
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.countryCode !== undefined && { countryCode: dto.countryCode }),
      ...(dto.emergencyContact !== undefined && { emergencyContact: dto.emergencyContact }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.role !== undefined && { role: dto.role }),
      profileImage: dto.profileImage,
      birthPlace: dto.birthPlace,
      ...(dto.rashi !== undefined && { rashi: dto.rashi }),
      ...(dto.gotra !== undefined && { gotra: dto.gotra }),
    };

    if (dto.dob) {
      userPayload.dob = new Date(dto.dob);
    }

    let hasAadhaarDoc = false;
    let hasPanDoc = false;

    if (user.role === USER_ROLE.PUROHIT && profile) {
      hasAadhaarDoc = Boolean(
        dto.aadhaarDoc || (dto.profile && (dto.profile as any).aadhaarDoc),
      );
      hasPanDoc = Boolean(
        dto.panDoc || (dto.profile && (dto.profile as any).panDoc),
      );

      const effectiveAadhaarNumber = (
        dto.aadhaarNumber ??
        dto.profile?.aadhaarNumber ??
        profile.aadhaarNumber
      )?.trim();

      if (hasAadhaarDoc && !effectiveAadhaarNumber) {
        throw new BadRequestException(
          'aadhaarNumber is required when aadhaarDoc is uploaded',
        );
      }

      if (
        effectiveAadhaarNumber &&
        effectiveAadhaarNumber !== profile.aadhaarNumber
      ) {
        const existingAadhaar = await this.purohitProfileRepository.findOne({
          where: { aadhaarNumber: effectiveAadhaarNumber },
        });
        if (existingAadhaar && existingAadhaar.id !== profile.id) {
          throw new ConflictException('Aadhaar number already in use');
        }
      }

      const existingAccounts =
        await this.bankAccountRepository.findByUserId(Number(id));
      const hasBankOrUpi = Boolean(
        (existingAccounts &&
          existingAccounts.length > 0 &&
          existingAccounts.some(
            (acc) => Boolean(acc.accountNumber || acc.upiId),
          )) ||
        dto.bankAccount ||
        dto.accountNumber ||
        dto.upiId,
      );
      const hasAnyDoc =
        hasAadhaarDoc ||
        hasPanDoc ||
        Boolean(profile.aadhaarDocUrl || profile.panDocUrl);

      if (user.isAdminCreated && hasAnyDoc && hasBankOrUpi) {
        userPayload.isAdminCreated = false;
      }
    } else if (user.role === USER_ROLE.ASTROLOGER && astrologerProfile) {
      hasAadhaarDoc = Boolean(
        dto.aadhaarDoc || (dto.profile && (dto.profile as any).aadhaarDoc),
      );
      hasPanDoc = Boolean(
        dto.panDoc || (dto.profile && (dto.profile as any).panDoc),
      );

      const effectiveAadhaarNumber = (
        dto.aadhaarNumber ??
        dto.profile?.aadhaarNumber ??
        astrologerProfile.aadhaarNumber
      )?.trim();

      if (hasAadhaarDoc && !effectiveAadhaarNumber) {
        throw new BadRequestException(
          'aadhaarNumber is required when aadhaarDoc is uploaded',
        );
      }

      if (
        effectiveAadhaarNumber &&
        effectiveAadhaarNumber !== astrologerProfile.aadhaarNumber
      ) {
        const astrologerRepo = this.dataSource.getRepository(AstrologerProfile);
        const existingAadhaar = await astrologerRepo.findOne({
          where: { aadhaarNumber: effectiveAadhaarNumber },
        });
        if (existingAadhaar && existingAadhaar.id !== astrologerProfile.id) {
          throw new ConflictException('Aadhaar number already in use');
        }
      }

      const existingAccounts =
        await this.bankAccountRepository.findByUserId(Number(id));
      const hasBankOrUpi = Boolean(
        (existingAccounts &&
          existingAccounts.length > 0 &&
          existingAccounts.some(
            (acc) => Boolean(acc.accountNumber || acc.upiId),
          )) ||
        dto.bankAccount ||
        dto.accountNumber ||
        dto.upiId,
      );

      if (user.isAdminCreated && (hasAadhaarDoc || hasPanDoc || hasBankOrUpi)) {
        userPayload.isAdminCreated = false;
      }
    }

    const updatedUser = await this.userRepository.updateUser(id, userPayload);

    if (user.role === USER_ROLE.PUROHIT && profile) {
      const bio = dto.bio !== undefined ? dto.bio : dto.profile?.bio;
      const qualification = dto.qualification !== undefined ? dto.qualification : dto.profile?.qualification;
      const experienceYears = dto.experienceYears !== undefined ? dto.experienceYears : dto.profile?.experienceYears;
      const aadhaarNumber = dto.aadhaarNumber !== undefined ? dto.aadhaarNumber : dto.profile?.aadhaarNumber;
      const city = dto.city !== undefined ? dto.city : dto.profile?.city;
      const state = dto.state !== undefined ? dto.state : dto.profile?.state;
      const languages = dto.languages !== undefined ? dto.languages : dto.profile?.languages;
      const specializations = dto.specializations !== undefined ? dto.specializations : dto.profile?.specializations;
      const isOnlineAvailable = dto.isOnlineAvailable !== undefined ? dto.isOnlineAvailable : dto.profile?.isOnlineAvailable;
      const isOfflineAvailable = dto.isOfflineAvailable !== undefined ? dto.isOfflineAvailable : dto.profile?.isOfflineAvailable;

      const profilePayload: any = {};
      if (bio !== undefined) profilePayload.bio = bio;
      if (qualification !== undefined) profilePayload.qualification = qualification;
      if (experienceYears !== undefined) profilePayload.experienceYears = Number(experienceYears);
      if (aadhaarNumber !== undefined) profilePayload.aadhaarNumber = aadhaarNumber;
      if (city !== undefined) profilePayload.city = city;
      if (state !== undefined) profilePayload.state = state;
      if (languages !== undefined) profilePayload.languages = languages;
      if (specializations !== undefined) profilePayload.specializations = specializations;
      const aadhaarDocUrl =
        dto.aadhaarDoc !== undefined
          ? dto.aadhaarDoc
          : (dto.profile as any)?.aadhaarDoc;
      const panDocUrl =
        dto.panDoc !== undefined
          ? dto.panDoc
          : (dto.profile as any)?.panDoc;
      const certificateUrl =
        dto.certificate !== undefined
          ? dto.certificate
          : (dto.profile as any)?.certificate;
      const templeAffiliationProofUrl =
        dto.templeAffiliationProof !== undefined
          ? dto.templeAffiliationProof
          : (dto.profile as any)?.templeAffiliationProof;

      if (aadhaarDocUrl !== undefined) profilePayload.aadhaarDocUrl = aadhaarDocUrl;
      if (panDocUrl !== undefined) profilePayload.panDocUrl = panDocUrl;
      if (certificateUrl !== undefined) profilePayload.certificateUrl = certificateUrl;
      if (templeAffiliationProofUrl !== undefined)
        profilePayload.templeAffiliationProofUrl = templeAffiliationProofUrl;
      if (isOnlineAvailable !== undefined) {
        profilePayload.isOnlineAvailable =
          isOnlineAvailable === true ||
          isOnlineAvailable === 'true' ||
          String(isOnlineAvailable) === 'true';
      }
      if (isOfflineAvailable !== undefined) {
        profilePayload.isOfflineAvailable =
          isOfflineAvailable === true ||
          isOfflineAvailable === 'true' ||
          String(isOfflineAvailable) === 'true';
      }

      if (hasAadhaarDoc || hasPanDoc) {
        profilePayload.verificationStatus = PUROHIT_VERIFICATION_STATUS.APPROVED;
        profilePayload.rejectionReason = null;
        profile.verificationStatus = PUROHIT_VERIFICATION_STATUS.APPROVED;
        profile.rejectionReason = null as any;
      }

      if (Object.keys(profilePayload).length > 0) {
        await this.purohitProfileRepository.update(profile.id, profilePayload);
      }

      const mediaStatus =
        hasAadhaarDoc || hasPanDoc
          ? PUROHIT_MEDIA_VERIFICATION_STATUS.APPROVED
          : PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING;

      await this.syncPurohitMediaDocuments(
        profile.id,
        {
          aadhaarDocUrl,
          panDocUrl,
          certificateUrl,
          templeAffiliationProofUrl,
        },
        mediaStatus,
      );

      if (hasAadhaarDoc || hasPanDoc) {
        await this.dataSource
          .getRepository(PurohitMedia)
          .createQueryBuilder()
          .update(PurohitMedia)
          .set({
            verificationStatus: PUROHIT_MEDIA_VERIFICATION_STATUS.APPROVED,
            rejectionReason: () => 'NULL',
          })
          .where('"purohitId" = :profileId', { profileId: profile.id })
          .andWhere('"deletedAt" IS NULL')
          .execute();
      }

      const stateToUpdate = dto.state !== undefined ? dto.state : dto.profile?.state;
      const cityToUpdate = dto.city !== undefined ? dto.city : dto.profile?.city;
      if (stateToUpdate !== undefined || cityToUpdate !== undefined) {
        const defaultArea =
          (await this.purohitServiceAreaRepository.findOne({
            where: { purohitId: Number(id), isDefault: true },
          })) ||
          (await this.purohitServiceAreaRepository.findOne({
            where: { purohitId: Number(id) },
            order: { createdAt: 'DESC' },
          }));
        if (defaultArea) {
          await this.purohitServiceAreaRepository.update(defaultArea.id, {
            ...(stateToUpdate !== undefined && { state: stateToUpdate }),
            ...(cityToUpdate !== undefined && { city: cityToUpdate }),
          });
        }
      }



      if (uniqueServiceIds !== undefined) {
        const existingServices = await this.purohitServiceRepository.find({
          where: { purohitId: profile.id } as any,
          withDeleted: true,
        });

        // 1. Soft-delete active mappings not in desired list
        for (const existing of existingServices) {
          if (!existing.deletedAt && !uniqueServiceIds.includes(existing.serviceId)) {
            await this.purohitServiceRepository.update(existing.id, {
              isActive: false,
            });
            await this.purohitServiceRepository.softDelete(existing.id);
          }
        }

        // 2. Add or restore desired services
        for (const serviceId of uniqueServiceIds) {
          const existing = existingServices.find((es) => es.serviceId === serviceId);
          if (existing) {
            if (existing.deletedAt) {
              await this.purohitServiceRepository.restore(existing.id);
              await this.purohitServiceRepository.update(existing.id, {
                deletedAt: null as any,
                isActive: true,
              });
            } else if (!existing.isActive) {
              await this.purohitServiceRepository.update(existing.id, {
                isActive: true,
              });
            }
          } else {
            const newMapping = this.purohitServiceRepository.create({
              purohitId: profile.id,
              serviceId,
              isActive: true,
              isOnline: false,
              isOffline: true,
            });
            await this.purohitServiceRepository.save(newMapping);
          }
        }
      }

      if (uniqueAreaNames !== undefined) {
        const activeAreas = await this.purohitServiceAreaRepository.find({
          where: { purohitId: Number(id) } as any,
        });

        // 1. Soft-delete existing active areas not in desired list
        for (const existingArea of activeAreas) {
          const areaNameMatch = uniqueAreaNames.find(
            (name) =>
              name.toLowerCase() === (existingArea.city || '').toLowerCase() ||
              name.toLowerCase() === (existingArea.addressLabel || '').toLowerCase(),
          );
          if (!areaNameMatch) {
            await this.purohitServiceAreaRepository.deleteArea(existingArea.id);
          }
        }

        // 2. Retain or add desired areas
        const retainedAreas = activeAreas.filter((a) =>
          uniqueAreaNames.some(
            (name) =>
              name.toLowerCase() === (a.city || '').toLowerCase() ||
              name.toLowerCase() === (a.addressLabel || '').toLowerCase(),
          ),
        );

        let hasDefault = retainedAreas.some((a) => a.isDefault);

        for (const areaName of uniqueAreaNames) {
          const existing = retainedAreas.find(
            (ea) =>
              ea.city?.toLowerCase() === areaName.toLowerCase() ||
              ea.addressLabel?.toLowerCase() === areaName.toLowerCase(),
          );
          if (existing) {
            if (!hasDefault) {
              await this.purohitServiceAreaRepository.updateArea(existing.id, {
                isDefault: true,
              });
              hasDefault = true;
            }
          } else {
            const newArea = this.purohitServiceAreaRepository.create({
              purohitId: Number(id),
              addressLabel: areaName,
              streetName: areaName,
              fullAddress: areaName,
              city: areaName,
              pincode: '000000',
              isDefault: !hasDefault,
              serviceRadiusKm: 10,
            });
            await this.purohitServiceAreaRepository.save(newArea);
            if (!hasDefault) hasDefault = true;
          }
        }
      }
    } else if (user.role === USER_ROLE.ASTROLOGER && astrologerProfile) {
      const bio = dto.bio !== undefined ? dto.bio : dto.profile?.bio;
      const qualification =
        dto.qualification !== undefined
          ? dto.qualification
          : dto.profile?.qualification;
      const experienceYears =
        dto.experienceYears !== undefined
          ? dto.experienceYears
          : dto.profile?.experienceYears;
      const aadhaarNumber =
        dto.aadhaarNumber !== undefined
          ? dto.aadhaarNumber
          : dto.profile?.aadhaarNumber;
      const city = dto.city !== undefined ? dto.city : dto.profile?.city;
      const state = dto.state !== undefined ? dto.state : dto.profile?.state;
      const languages =
        dto.languages !== undefined
          ? dto.languages
          : dto.profile?.languages;
      const specializations =
        dto.specializations !== undefined
          ? dto.specializations
          : dto.profile?.specializations;
      const specification =
        dto.specification !== undefined
          ? dto.specification
          : dto.profile?.specification;
      const ratePerMinute =
        dto.ratePerMinute !== undefined
          ? dto.ratePerMinute
          : dto.profile?.ratePerMinute;
      const commissionPrice =
        dto.commissionPrice !== undefined
          ? dto.commissionPrice
          : dto.profile?.commissionPrice;
      const astrologyPrice =
        dto.astrologyPrice !== undefined
          ? dto.astrologyPrice
          : (dto.profile as any)?.astrologyPrice;
      const commissionPercentage =
        dto.commissionPercentage !== undefined
          ? dto.commissionPercentage
          : (dto.profile as any)?.commissionPercentage;
      const astrologerPayout =
        dto.astrologerPayout !== undefined
          ? dto.astrologerPayout
          : (dto.profile as any)?.astrologerPayout;
      const verificationStatus =
        dto.verificationStatus !== undefined
          ? dto.verificationStatus
          : dto.profile?.verificationStatus;
      const rejectionReason =
        dto.rejectionReason !== undefined
          ? dto.rejectionReason
          : dto.profile?.rejectionReason;

      const aadhaarDocUrl =
        dto.aadhaarDoc !== undefined
          ? dto.aadhaarDoc
          : (dto.profile as any)?.aadhaarDoc;
      const panDocUrl =
        dto.panDoc !== undefined
          ? dto.panDoc
          : (dto.profile as any)?.panDoc;
      const certificateUrl =
        dto.certificate !== undefined
          ? dto.certificate
          : (dto.profile as any)?.certificate;

      const profilePayload: Partial<AstrologerProfile> = {};
      if (bio !== undefined) profilePayload.bio = bio;
      if (qualification !== undefined) {
        profilePayload.qualification = parseStringArray(qualification) || qualification;
      }
      if (experienceYears !== undefined && experienceYears !== null && experienceYears !== '') {
        profilePayload.experienceYears = Number(experienceYears);
      }
      if (aadhaarNumber !== undefined) profilePayload.aadhaarNumber = aadhaarNumber;
      if (city !== undefined) profilePayload.city = city;
      if (state !== undefined) profilePayload.state = state;
      if (languages !== undefined) {
        profilePayload.languages = parseStringArray(languages) || languages;
      }
      if (specializations !== undefined) {
        profilePayload.specializations = parseStringArray(specializations) || specializations;
      }
      if (specification !== undefined) profilePayload.specification = specification;

      if (ratePerMinute !== undefined) {
        profilePayload.ratePerMinute =
          ratePerMinute !== null && ratePerMinute !== ''
            ? Number(ratePerMinute)
            : null;
      }
      if (astrologyPrice !== undefined) {
        profilePayload.astrologyPrice =
          astrologyPrice !== null && astrologyPrice !== ''
            ? Number(astrologyPrice)
            : null;
      }
      if (commissionPercentage !== undefined) {
        profilePayload.commissionPercentage =
          commissionPercentage !== null && commissionPercentage !== ''
            ? Number(commissionPercentage)
            : null;
      }
      const effPrice =
        profilePayload.astrologyPrice !== undefined
          ? profilePayload.astrologyPrice
          : (astrologerProfile.astrologyPrice != null
              ? Number(astrologerProfile.astrologyPrice)
              : null);

      const effPct =
        profilePayload.commissionPercentage !== undefined
          ? profilePayload.commissionPercentage
          : (astrologerProfile.commissionPercentage != null
              ? Number(astrologerProfile.commissionPercentage)
              : null);

      if (
        astrologyPrice !== undefined ||
        commissionPercentage !== undefined ||
        (effPrice !== null && (commissionPrice !== undefined || astrologerPayout !== undefined))
      ) {
        if (effPrice !== null && effPct !== null) {
          const expectedCommissionPrice = Number(
            ((effPrice * effPct) / 100).toFixed(2),
          );
          const expectedAstrologerPayout = Number(
            (effPrice - expectedCommissionPrice).toFixed(2),
          );

          if (
            commissionPrice !== undefined &&
            commissionPrice !== null &&
            (commissionPrice as any) !== ''
          ) {
            const parsedCommPrice = Number(commissionPrice);
            if (Math.abs(parsedCommPrice - expectedCommissionPrice) > 0.01) {
              throw new BadRequestException(
                `commissionPrice (${parsedCommPrice}) must match the calculated commission price based on astrologyPrice (${effPrice}) and commissionPercentage (${effPct}%): ${expectedCommissionPrice}`,
              );
            }
          }

          if (
            astrologerPayout !== undefined &&
            astrologerPayout !== null &&
            (astrologerPayout as any) !== ''
          ) {
            const parsedPayout = Number(astrologerPayout);
            if (Math.abs(parsedPayout - expectedAstrologerPayout) > 0.01) {
              throw new BadRequestException(
                `astrologerPayout (${parsedPayout}) must match the calculated astrologer payout based on astrologyPrice (${effPrice}) and commissionPrice (${expectedCommissionPrice}): ${expectedAstrologerPayout}`,
              );
            }
          }

          profilePayload.commissionPrice = expectedCommissionPrice;
          profilePayload.astrologerPayout = expectedAstrologerPayout;
        } else if (effPrice !== null) {
          const expectedAstrologerPayout = Number(effPrice.toFixed(2));
          if (
            astrologerPayout !== undefined &&
            astrologerPayout !== null &&
            (astrologerPayout as any) !== ''
          ) {
            const parsedPayout = Number(astrologerPayout);
            if (Math.abs(parsedPayout - expectedAstrologerPayout) > 0.01) {
              throw new BadRequestException(
                `astrologerPayout (${parsedPayout}) must match the calculated astrologer payout based on astrologyPrice (${effPrice}): ${expectedAstrologerPayout}`,
              );
            }
          }
          profilePayload.commissionPrice = null;
          profilePayload.astrologerPayout = expectedAstrologerPayout;
        } else if (astrologyPrice !== undefined) {
          profilePayload.commissionPrice = null;
          profilePayload.astrologerPayout = null;
        }
      } else if (commissionPrice !== undefined) {
        profilePayload.commissionPrice =
          commissionPrice !== null && (commissionPrice as any) !== ''
            ? Number(commissionPrice)
            : null;
      } else if (astrologerPayout !== undefined) {
        profilePayload.astrologerPayout =
          astrologerPayout !== null && (astrologerPayout as any) !== ''
            ? Number(astrologerPayout)
            : null;
      } else if (astrologerProfile.astrologerPayout == null && effPrice !== null) {
        const effComm =
          astrologerProfile.commissionPrice != null
            ? Number(astrologerProfile.commissionPrice)
            : effPct != null
              ? Number(((effPrice * effPct) / 100).toFixed(2))
              : 0;
        profilePayload.astrologerPayout = Number((effPrice - effComm).toFixed(2));
      }

      if (aadhaarDocUrl !== undefined) profilePayload.aadhaarDocUrl = aadhaarDocUrl;
      if (panDocUrl !== undefined) profilePayload.panDocUrl = panDocUrl;
      if (certificateUrl !== undefined) profilePayload.certificateUrl = certificateUrl;

      if (verificationStatus !== undefined) {
        profilePayload.verificationStatus = verificationStatus;
        if (verificationStatus === PUROHIT_VERIFICATION_STATUS.APPROVED) {
          profilePayload.rejectionReason = null as any;
        } else if (rejectionReason !== undefined) {
          profilePayload.rejectionReason = rejectionReason;
        }
      } else if (hasAadhaarDoc || hasPanDoc) {
        profilePayload.verificationStatus = PUROHIT_VERIFICATION_STATUS.APPROVED;
        profilePayload.rejectionReason = null as any;
      } else if (rejectionReason !== undefined) {
        profilePayload.rejectionReason = rejectionReason;
      }

      if (Object.keys(profilePayload).length > 0) {
        const astrologerRepo = this.dataSource.getRepository(AstrologerProfile);
        await astrologerRepo.update(astrologerProfile.id, profilePayload as any);

        if (profilePayload.verificationStatus === PUROHIT_VERIFICATION_STATUS.APPROVED) {
          await this.dataSource
            .getRepository(BankAccount)
            .createQueryBuilder()
            .update(BankAccount)
            .set({
              verificationStatus: BANK_VERIFICATION_STATUS.VERIFIED,
            })
            .where('"userId" = :userId', { userId: Number(id) })
            .andWhere('"deletedAt" IS NULL')
            .execute();
        } else if (profilePayload.verificationStatus === PUROHIT_VERIFICATION_STATUS.REJECTED) {
          await this.dataSource
            .getRepository(BankAccount)
            .createQueryBuilder()
            .update(BankAccount)
            .set({
              verificationStatus: BANK_VERIFICATION_STATUS.FAILED,
            })
            .where('"userId" = :userId', { userId: Number(id) })
            .andWhere('"deletedAt" IS NULL')
            .execute();
        }
      }
    } else if (user.role === USER_ROLE.CUSTOMER) {
      const stateToUpdate = dto.state !== undefined ? dto.state : dto.profile?.state;
      const cityToUpdate = dto.city !== undefined ? dto.city : dto.profile?.city;
      if (stateToUpdate !== undefined || cityToUpdate !== undefined) {
        const defaultAddress =
          (await this.customerAddressRepository.findOne({
            where: { customerId: Number(id), isDefault: true },
          })) ||
          (await this.customerAddressRepository.findOne({
            where: { customerId: Number(id) },
            order: { createdAt: 'DESC' },
          }));
        if (defaultAddress) {
          await this.customerAddressRepository.update(defaultAddress.id, {
            ...(stateToUpdate !== undefined && { state: stateToUpdate }),
            ...(cityToUpdate !== undefined && { city: cityToUpdate }),
          });
        }
      }
    }

    if (user.role === USER_ROLE.PUROHIT || user.role === USER_ROLE.ASTROLOGER) {
      const bankData = dto.bankAccount || (dto.bankAccounts && dto.bankAccounts[0]) || {};
      const accountHolderName = dto.accountHolderName ?? bankData.accountHolderName;
      const accountNumber = dto.accountNumber ?? bankData.accountNumber;
      const ifscCode = dto.ifscCode ?? bankData.ifscCode;
      const bankName = dto.bankName ?? bankData.bankName;
      const paymentMethod = dto.paymentMethod ?? bankData.paymentMethod;
      const upiId = dto.upiId ?? bankData.upiId;

      if (
        accountHolderName !== undefined ||
        accountNumber !== undefined ||
        ifscCode !== undefined ||
        bankName !== undefined ||
        paymentMethod !== undefined ||
        upiId !== undefined
      ) {
        const existingBankAccount =
          (await this.bankAccountRepository.findOne({
            where: { userId: Number(id), isPrimary: true },
          })) ||
          (await this.bankAccountRepository.findOne({
            where: { userId: Number(id) },
          }));

        if (existingBankAccount) {
          await this.bankAccountRepository.update(existingBankAccount.id, {
            ...(accountHolderName !== undefined && { accountHolderName }),
            ...(accountNumber !== undefined && { accountNumber }),
            ...(ifscCode !== undefined && { ifscCode }),
            ...(bankName !== undefined && { bankName }),
            ...(paymentMethod !== undefined && { paymentMethod }),
            ...(upiId !== undefined && { upiId }),
          });
        } else if (accountNumber || upiId) {
          const newAccount = this.bankAccountRepository.create({
            userId: Number(id),
            accountHolderName: accountHolderName || '',
            accountNumber: accountNumber || '',
            ifscCode: ifscCode || '',
            bankName: bankName || '',
            paymentMethod: paymentMethod || (upiId ? PUROHIT_PAYMENT_METHOD.UPI : PUROHIT_PAYMENT_METHOD.BANK),
            upiId: upiId || null,
            isPrimary: true,
          });
          await this.bankAccountRepository.save(newAccount);
        }
      }
    }

    const fullUser = await this.userRepository.getFullProfile(
      Number(id),
      user.role,
    );

    const { hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } =
      (fullUser || updatedUser || {}) as any;
    // TODO: VERCEL_BLOB_MIGRATION
    // Legacy S3 signed URL generation retained for rollback/reference.
    /*
    if (safeUser.profileImage) {
      try {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(
          safeUser.profileImage,
        );
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }
    */
    // Active Vercel Blob implementation:
    // Stored public Blob URLs or existing URLs are returned directly without generating an S3-style signed URL.

    // Resolve city and state for user profile
    const { city: userCity, state: userState } = this.resolveUserCityAndState(safeUser);
    if ((safeUser as any).profile) {
      const profile = { ...(safeUser as any).profile };
      if (profile.aadhaarDocUrl) {
        profile.aadhaarDocDownloadUrl =
          await this.s3Service.getAttachmentDownloadUrl(
            profile.aadhaarDocUrl,
          );
        profile.aadhaarDocUrl = await this.s3Service.getDownloadUrl(
          profile.aadhaarDocUrl,
        );
      }
      if (profile.panDocUrl) {
        profile.panDocDownloadUrl =
          await this.s3Service.getAttachmentDownloadUrl(profile.panDocUrl);
        profile.panDocUrl = await this.s3Service.getDownloadUrl(
          profile.panDocUrl,
        );
      }
      if (profile.certificateUrl) {
        profile.certificateDownloadUrl =
          await this.s3Service.getAttachmentDownloadUrl(
            profile.certificateUrl,
          );
        profile.certificateUrl = await this.s3Service.getDownloadUrl(
          profile.certificateUrl,
        );
      }
      if (profile.templeAffiliationProofUrl) {
        profile.templeAffiliationProofDownloadUrl =
          await this.s3Service.getAttachmentDownloadUrl(
            profile.templeAffiliationProofUrl,
          );
        profile.templeAffiliationProofUrl =
          await this.s3Service.getDownloadUrl(
            profile.templeAffiliationProofUrl,
          );
      }
      (safeUser as any).profile = this.formatProfileWithCityAndState(
        profile,
        userCity,
        userState,
      );
      if (safeUser.role === USER_ROLE.ASTROLOGER) {
        (safeUser as any).astrologerProfile = (safeUser as any).profile;
      }
      (safeUser as any).verificationStatus = profile.verificationStatus;
      (safeUser as any).rejectionReason = profile.rejectionReason ?? null;
      delete (safeUser as any).city;
      delete (safeUser as any).state;
      delete (safeUser as any).purohitServices;
    } else {
      (safeUser as any).city = userCity;
      (safeUser as any).state = userState;
    }

    if (Array.isArray(safeUser.addresses)) {
      safeUser.addresses = this.sortCustomerAddresses(safeUser.addresses);
    }
    if (Array.isArray(safeUser.serviceAreas)) {
      safeUser.serviceAreas = this.sortServiceAreas(safeUser.serviceAreas);
    }
    if (Array.isArray((safeUser as any).bankAccounts)) {
      (safeUser as any).bankAccounts = this.sortBankAccounts((safeUser as any).bankAccounts);
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
      aadhaarDoc?: Express.Multer.File[];
      panDoc?: Express.Multer.File[];
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

    const userSuppliedCommissionPrice = dto.commissionPrice;
    const userSuppliedAstrologerPayout = dto.astrologerPayout;

    // Normal users cannot change their role, status, or override commissionPrice directly
    if (user.role !== USER_ROLE.ADMIN) {
      delete dto.role;
      delete dto.status;
      delete dto.commissionPrice;
      delete dto.astrologerPayout;
    }

    if (dto.password) {
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      (dto as any).hashedPassword = hashedPassword;
      delete dto.password;
      delete dto.confirmPassword;
    }

    const profileImageFile = files?.profileImage?.[0];
    const oldProfileImage = user.profileImage;
    if (profileImageFile && profileImageFile.buffer && profileImageFile.buffer.length > 0) {
      dto.profileImage = await this.s3Service.uploadProfileImage(
        id,
        profileImageFile,
      );

      // Delete old profile image if it was a Vercel Blob URL
      if (
        oldProfileImage &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldProfileImage) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldProfileImage);
      }
    } else if (typeof dto.profileImage === 'string' && dto.profileImage.trim().length > 0) {
      dto.profileImage = dto.profileImage.trim();
    } else {
      dto.profileImage = null as any;
      if (
        oldProfileImage &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldProfileImage) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldProfileImage);
      }
    }


    if (files?.aadhaarDoc?.length) {
      dto.aadhaarDoc = await this.s3Service.uploadFileHelper(
        id,
        'aadhaarDoc',
        files.aadhaarDoc,
      );
    }

    if (files?.panDoc?.length) {
      dto.panDoc = await this.s3Service.uploadFileHelper(
        id,
        'panDoc',
        files.panDoc,
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
      ...(dto.rashi !== undefined && { rashi: dto.rashi }),
      ...(dto.gotra !== undefined && { gotra: dto.gotra }),
    };

    if (dto.dob) {
      userPayload.dob = new Date(dto.dob);
    }

    await this.userRepository.updateUser(id, userPayload);

    if (user.role === USER_ROLE.PUROHIT) {
      const profilePayload: any = {};
      if (dto.languages !== undefined) profilePayload.languages = dto.languages;
      if (dto.city !== undefined) profilePayload.city = dto.city;
      if (dto.state !== undefined) profilePayload.state = dto.state;
      if (dto.specializations !== undefined)
        profilePayload.specializations = dto.specializations;
      if (dto.bio !== undefined) profilePayload.bio = dto.bio;
      if (dto.experienceYears !== undefined)
        profilePayload.experienceYears = dto.experienceYears;
      if (dto.qualification !== undefined)
        profilePayload.qualification = dto.qualification;
      if (dto.isOnlineAvailable !== undefined)
        profilePayload.isOnlineAvailable =
          dto.isOnlineAvailable === 'true' ||
          dto.isOnlineAvailable === (true as any);
      if (dto.isOfflineAvailable !== undefined)
        profilePayload.isOfflineAvailable =
          dto.isOfflineAvailable === 'true' ||
          dto.isOfflineAvailable === (true as any);

      if (Object.keys(profilePayload).length > 0) {
        const profile = await this.purohitProfileRepository.findOne({
          where: { userId: Number(id) },
        });
        if (profile) {
          await this.purohitProfileRepository.update(
            profile.id,
            profilePayload,
          );
        }
      }
    }

    if (user.role === USER_ROLE.PUROHIT) {
      const profile = await this.purohitProfileRepository.findByUserId(
        Number(id),
      );

      if (profile) {
        // TODO: PUROHIT_VERIFICATION_RESUBMIT
        // When a REJECTED Purohit submits an Edit Profile update, automatically transition
        // verificationStatus from REJECTED -> PENDING and clear rejectionReason to null.
        const isRejected =
          profile.verificationStatus === PUROHIT_VERIFICATION_STATUS.REJECTED;
        const previousRejectionReason = profile.rejectionReason;

        const effectiveAadhaarNumber = (
          dto.aadhaarNumber ?? profile.aadhaarNumber
        )?.trim();

        if (dto.aadhaarDoc && !effectiveAadhaarNumber) {
          throw new BadRequestException(
            'aadhaarNumber is required when aadhaarDoc is uploaded',
          );
        }

        if (
          effectiveAadhaarNumber &&
          effectiveAadhaarNumber !== profile.aadhaarNumber
        ) {
          const existingAadhaar = await this.purohitProfileRepository.findOne({
            where: { aadhaarNumber: effectiveAadhaarNumber },
          });
          if (existingAadhaar && existingAadhaar.id !== profile.id) {
            throw new ConflictException('Aadhaar number already in use');
          }
        }

        const hasDoc = Boolean(
          dto.aadhaarDoc ||
          dto.panDoc ||
          profile.aadhaarDocUrl ||
          profile.panDocUrl,
        );

        const existingBankAccounts =
          await this.bankAccountRepository.findByUserId(Number(id));
        const hasBankOrUpi = Boolean(
          (existingBankAccounts &&
            existingBankAccounts.length > 0 &&
            existingBankAccounts.some(
              (acc) => Boolean(acc.accountNumber || acc.upiId),
            )) ||
          dto.accountNumber ||
          dto.upiId ||
          dto.bankAccount,
        );

        if (user.isAdminCreated && hasDoc && hasBankOrUpi) {
          await this.userRepository.updateUser(id, { isAdminCreated: false });
          user.isAdminCreated = false;
        }

        await this.purohitProfileRepository.update(profile.id, {
          bio: dto.bio,
          qualification: dto.qualification,
          experienceYears: dto.experienceYears,
          aadhaarNumber: dto.aadhaarNumber,
          city: dto.city,
          languages: dto.languages,
          specializations: dto.specializations,
          ...(dto.aadhaarDoc && { aadhaarDocUrl: dto.aadhaarDoc }),
          ...(dto.panDoc && { panDocUrl: dto.panDoc }),
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
          ...(isRejected && {
            verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
            rejectionReason: () => 'NULL',
          }),
        });

        await this.syncPurohitMediaDocuments(profile.id, {
          aadhaarDocUrl: dto.aadhaarDoc,
          panDocUrl: dto.panDoc,
          certificateUrl: dto.certificate,
          templeAffiliationProofUrl: dto.templeAffiliationProof,
        });

        if (isRejected) {
          // Reset any previously rejected media documents to PENDING and clear rejectionReason
          await this.dataSource
            .getRepository(PurohitMedia)
            .createQueryBuilder()
            .update(PurohitMedia)
            .set({
              verificationStatus: PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING,
              rejectionReason: () => 'NULL',
            })
            .where('"purohitId" = :profileId', { profileId: profile.id })
            .andWhere('"deletedAt" IS NULL')
            .execute();

          // Reset any failed bank accounts to PENDING
          await this.dataSource
            .getRepository(BankAccount)
            .createQueryBuilder()
            .update(BankAccount)
            .set({
              verificationStatus: BANK_VERIFICATION_STATUS.PENDING,
            })
            .where('"userId" = :userId AND "verificationStatus" = :status', {
              userId: Number(id),
              status: BANK_VERIFICATION_STATUS.FAILED,
            })
            .andWhere('"deletedAt" IS NULL')
            .execute();

          await this.auditLogService.createAuditLog({
            actorId: Number(id),
            actorType: ACTOR_TYPE.USER,
            actorRole: USER_ROLE.PUROHIT,
            module: AUDIT_MODULE.USER,
            entity: 'PurohitProfile',
            entityId: String(profile.id),
            action: 'PUROHIT_VERIFICATION_RESUBMITTED',
            message: `Purohit #${id} resubmitted profile for verification via profile update.`,
            oldValue: {
              verificationStatus: PUROHIT_VERIFICATION_STATUS.REJECTED,
              rejectionReason: previousRejectionReason,
            },
            newValue: {
              verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
              rejectionReason: null,
            },
          });

          if (this.notificationService) {
            try {
              await this.notificationService.createNotification(
                Number(id),
                'Verification Resubmitted',
                'Your profile verification request has been resubmitted and is under review.',
                NOTIFICATION_TYPE.SYSTEM,
                profile.id,
                'PUROHIT_PROFILE',
              );

              const firstName =
                dto.firstName !== undefined ? dto.firstName : user.firstName;
              const lastName =
                dto.lastName !== undefined ? dto.lastName : user.lastName;
              const purohitName =
                [firstName, lastName].filter(Boolean).join(' ').trim() ||
                dto.username ||
                user.username ||
                `Purohit #${id}`;

              const adminResubmitMessage = `Purohit profile resubmitted for verification. ${purohitName} has updated the previously rejected profile and submitted it for Admin review.`;

              await this.notificationService.notifyAdmins(
                'Purohit Verification Resubmitted',
                adminResubmitMessage,
                NOTIFICATION_TYPE.SYSTEM,
                profile.id,
                'PUROHIT_PROFILE',
                {
                  userId: Number(id),
                  purohitId: profile.id,
                  purohitName,
                },
              );
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : String(err);
              this.logger.warn(
                `Failed to send purohit resubmission notification: ${message}`,
              );
            }
          }
        }
      }

      if (dto.state !== undefined || dto.city !== undefined) {
        const defaultArea =
          (await this.purohitServiceAreaRepository.findOne({
            where: { purohitId: Number(id), isDefault: true },
          })) ||
          (await this.purohitServiceAreaRepository.findOne({
            where: { purohitId: Number(id) },
            order: { createdAt: 'DESC' },
          }));
        if (defaultArea) {
          await this.purohitServiceAreaRepository.update(defaultArea.id, {
            ...(dto.state !== undefined && { state: dto.state }),
            ...(dto.city !== undefined && { city: dto.city }),
          });
        }
      }
    } else if (user.role === USER_ROLE.CUSTOMER) {
      if (dto.state !== undefined || dto.city !== undefined) {
        const defaultAddress =
          (await this.customerAddressRepository.findOne({
            where: { customerId: Number(id), isDefault: true },
          })) ||
          (await this.customerAddressRepository.findOne({
            where: { customerId: Number(id) },
            order: { createdAt: 'DESC' },
          }));
        if (defaultAddress) {
          await this.customerAddressRepository.update(defaultAddress.id, {
            ...(dto.state !== undefined && { state: dto.state }),
            ...(dto.city !== undefined && { city: dto.city }),
          });
        }
      }
    } else if (user.role === USER_ROLE.ASTROLOGER) {
      const astrologerRepo = this.dataSource.getRepository(AstrologerProfile);
      let astrologerProfile = await astrologerRepo.findOne({
        where: { userId: Number(id) },
      });

      if (!astrologerProfile) {
        astrologerProfile = astrologerRepo.create({
          userId: Number(id),
          verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
        });
        astrologerProfile = await astrologerRepo.save(astrologerProfile);
      }

      const isRejected =
        astrologerProfile.verificationStatus === PUROHIT_VERIFICATION_STATUS.REJECTED;
      const previousRejectionReason = astrologerProfile.rejectionReason;

      const effectiveAadhaarNumber = (
        dto.aadhaarNumber ?? astrologerProfile.aadhaarNumber
      )?.trim();

      if (dto.aadhaarDoc && !effectiveAadhaarNumber) {
        throw new BadRequestException(
          'aadhaarNumber is required when aadhaarDoc is uploaded',
        );
      }

      if (
        effectiveAadhaarNumber &&
        effectiveAadhaarNumber !== astrologerProfile.aadhaarNumber
      ) {
        const existingAadhaar = await astrologerRepo.findOne({
          where: { aadhaarNumber: effectiveAadhaarNumber },
        });
        if (existingAadhaar && existingAadhaar.id !== astrologerProfile.id) {
          throw new ConflictException('Aadhaar number already in use');
        }
      }

      const existingBankAccounts =
        await this.bankAccountRepository.findByUserId(Number(id));
      const hasBankOrUpi = Boolean(
        (existingBankAccounts &&
          existingBankAccounts.length > 0 &&
          existingBankAccounts.some(
            (acc) => Boolean(acc.accountNumber || acc.upiId),
          )) ||
        dto.accountNumber ||
        dto.upiId ||
        dto.bankAccount,
      );

      if (user.isAdminCreated && (dto.aadhaarDoc || dto.panDoc || hasBankOrUpi)) {
        await this.userRepository.updateUser(id, { isAdminCreated: false });
        user.isAdminCreated = false;
      }

      const profilePayload: Partial<AstrologerProfile> = {};
      if (dto.bio !== undefined) profilePayload.bio = dto.bio;
      if (dto.qualification !== undefined) {
        profilePayload.qualification = parseStringArray(dto.qualification) || dto.qualification;
      }
      if (dto.experienceYears !== undefined && dto.experienceYears !== null && (dto.experienceYears as any) !== '') {
        profilePayload.experienceYears = Number(dto.experienceYears);
      }
      if (dto.aadhaarNumber !== undefined) profilePayload.aadhaarNumber = dto.aadhaarNumber;
      if (dto.city !== undefined) profilePayload.city = dto.city;
      if (dto.state !== undefined) profilePayload.state = dto.state;
      if (dto.languages !== undefined) {
        profilePayload.languages = parseStringArray(dto.languages) || dto.languages;
      }
      if (dto.specializations !== undefined) {
        profilePayload.specializations = parseStringArray(dto.specializations) || dto.specializations;
      }
      if (dto.specification !== undefined) profilePayload.specification = dto.specification;
      if (dto.ratePerMinute !== undefined) {
        profilePayload.ratePerMinute =
          dto.ratePerMinute !== null && (dto.ratePerMinute as any) !== ''
            ? Number(dto.ratePerMinute)
            : null;
      }
      if (dto.astrologyPrice !== undefined) {
        profilePayload.astrologyPrice =
          dto.astrologyPrice !== null && (dto.astrologyPrice as any) !== ''
            ? Number(dto.astrologyPrice)
            : null;
      }
      if (dto.commissionPercentage !== undefined) {
        profilePayload.commissionPercentage =
          dto.commissionPercentage !== null && (dto.commissionPercentage as any) !== ''
            ? Number(dto.commissionPercentage)
            : null;
      }
      const effPrice =
        profilePayload.astrologyPrice !== undefined
          ? profilePayload.astrologyPrice
          : (astrologerProfile.astrologyPrice != null
              ? Number(astrologerProfile.astrologyPrice)
              : null);

      const effPct =
        profilePayload.commissionPercentage !== undefined
          ? profilePayload.commissionPercentage
          : (astrologerProfile.commissionPercentage != null
              ? Number(astrologerProfile.commissionPercentage)
              : null);

      if (
        dto.astrologyPrice !== undefined ||
        dto.commissionPercentage !== undefined ||
        (effPrice !== null && (userSuppliedCommissionPrice !== undefined || userSuppliedAstrologerPayout !== undefined))
      ) {
        if (effPrice !== null && effPct !== null) {
          const expectedCommissionPrice = Number(
            ((effPrice * effPct) / 100).toFixed(2),
          );
          const expectedAstrologerPayout = Number(
            (effPrice - expectedCommissionPrice).toFixed(2),
          );

          if (
            userSuppliedCommissionPrice !== undefined &&
            userSuppliedCommissionPrice !== null &&
            (userSuppliedCommissionPrice as any) !== ''
          ) {
            const parsedCommPrice = Number(userSuppliedCommissionPrice);
            if (Math.abs(parsedCommPrice - expectedCommissionPrice) > 0.01) {
              throw new BadRequestException(
                `commissionPrice (${parsedCommPrice}) must match the calculated commission price based on astrologyPrice (${effPrice}) and commissionPercentage (${effPct}%): ${expectedCommissionPrice}`,
              );
            }
          }

          if (
            userSuppliedAstrologerPayout !== undefined &&
            userSuppliedAstrologerPayout !== null &&
            (userSuppliedAstrologerPayout as any) !== ''
          ) {
            const parsedPayout = Number(userSuppliedAstrologerPayout);
            if (Math.abs(parsedPayout - expectedAstrologerPayout) > 0.01) {
              throw new BadRequestException(
                `astrologerPayout (${parsedPayout}) must match the calculated astrologer payout based on astrologyPrice (${effPrice}) and commissionPrice (${expectedCommissionPrice}): ${expectedAstrologerPayout}`,
              );
            }
          }

          profilePayload.commissionPrice = expectedCommissionPrice;
          profilePayload.astrologerPayout = expectedAstrologerPayout;
        } else if (effPrice !== null) {
          const expectedAstrologerPayout = Number(effPrice.toFixed(2));
          if (
            userSuppliedAstrologerPayout !== undefined &&
            userSuppliedAstrologerPayout !== null &&
            (userSuppliedAstrologerPayout as any) !== ''
          ) {
            const parsedPayout = Number(userSuppliedAstrologerPayout);
            if (Math.abs(parsedPayout - expectedAstrologerPayout) > 0.01) {
              throw new BadRequestException(
                `astrologerPayout (${parsedPayout}) must match the calculated astrologer payout based on astrologyPrice (${effPrice}): ${expectedAstrologerPayout}`,
              );
            }
          }
          profilePayload.commissionPrice = null;
          profilePayload.astrologerPayout = expectedAstrologerPayout;
        } else if (dto.astrologyPrice !== undefined) {
          profilePayload.commissionPrice = null;
          profilePayload.astrologerPayout = null;
        }
      } else if (astrologerProfile.astrologerPayout == null && effPrice !== null) {
        const effComm =
          astrologerProfile.commissionPrice != null
            ? Number(astrologerProfile.commissionPrice)
            : effPct != null
              ? Number(((effPrice * effPct) / 100).toFixed(2))
              : 0;
        profilePayload.astrologerPayout = Number((effPrice - effComm).toFixed(2));
      }

      if (dto.aadhaarDoc !== undefined) profilePayload.aadhaarDocUrl = dto.aadhaarDoc;
      if (dto.panDoc !== undefined) profilePayload.panDocUrl = dto.panDoc;
      if (dto.certificate !== undefined) profilePayload.certificateUrl = dto.certificate;

      if (isRejected) {
        profilePayload.verificationStatus = PUROHIT_VERIFICATION_STATUS.PENDING;
        profilePayload.rejectionReason = null as any;
      }

      if (Object.keys(profilePayload).length > 0) {
        await astrologerRepo.update(astrologerProfile.id, profilePayload as any);
      }

      if (isRejected) {
        // Reset any failed bank accounts to PENDING
        await this.dataSource
          .getRepository(BankAccount)
          .createQueryBuilder()
          .update(BankAccount)
          .set({
            verificationStatus: BANK_VERIFICATION_STATUS.PENDING,
          })
          .where('"userId" = :userId AND "verificationStatus" = :status', {
            userId: Number(id),
            status: BANK_VERIFICATION_STATUS.FAILED,
          })
          .andWhere('"deletedAt" IS NULL')
          .execute();

        await this.auditLogService.createAuditLog({
          actorId: Number(id),
          actorType: ACTOR_TYPE.USER,
          actorRole: USER_ROLE.ASTROLOGER,
          module: AUDIT_MODULE.USER,
          entity: 'AstrologerProfile',
          entityId: String(astrologerProfile.id),
          action: 'ASTROLOGER_VERIFICATION_RESUBMITTED',
          message: `Astrologer #${id} resubmitted profile for verification via profile update.`,
          oldValue: {
            verificationStatus: PUROHIT_VERIFICATION_STATUS.REJECTED,
            rejectionReason: previousRejectionReason,
          },
          newValue: {
            verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
            rejectionReason: null,
          },
        });

        if (this.notificationService) {
          try {
            await this.notificationService.createNotification(
              Number(id),
              'Verification Resubmitted',
              'Your profile verification request has been resubmitted and is under review.',
              NOTIFICATION_TYPE.SYSTEM,
              astrologerProfile.id,
              'ASTROLOGER_PROFILE',
            );

            const firstName = dto.firstName !== undefined ? dto.firstName : user.firstName;
            const lastName = dto.lastName !== undefined ? dto.lastName : user.lastName;
            const astrologerName =
              [firstName, lastName].filter(Boolean).join(' ').trim() ||
              dto.username ||
              user.username ||
              `Astrologer #${id}`;

            const adminResubmitMessage = `Astrologer profile resubmitted for verification. ${astrologerName} has updated the previously rejected profile and submitted it for Admin review.`;

            await this.notificationService.notifyAdmins(
              'Astrologer Verification Resubmitted',
              adminResubmitMessage,
              NOTIFICATION_TYPE.SYSTEM,
              astrologerProfile.id,
              'ASTROLOGER_PROFILE',
              {
                userId: Number(id),
                astrologerId: astrologerProfile.id,
                astrologerName,
              },
            );
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(
              `Failed to send astrologer resubmission notification: ${message}`,
            );
          }
        }
      }
    }

    const fullUser = await this.userRepository.getFullProfile(
      Number(id),
      user.role,
    );

    const { hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } =
      (fullUser || {}) as any;
    // TODO: VERCEL_BLOB_MIGRATION
    // Legacy S3 signed URL generation retained for rollback/reference.
    /*
    if (safeUser.profileImage) {
      try {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(
          safeUser.profileImage,
        );
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }
    */
    // Active Vercel Blob implementation:
    // Stored public Blob URLs or existing URLs are returned directly without generating an S3-style signed URL.

    // Also generate pre-signed URLs for documents if present in the profile
    if (safeUser.profile) {
      try {
        if (safeUser.profile.aadhaarDocUrl)
          safeUser.profile.aadhaarDocUrl = await this.s3Service.getDownloadUrl(
            safeUser.profile.aadhaarDocUrl,
          );
        if (safeUser.profile.panDocUrl)
          safeUser.profile.panDocUrl = await this.s3Service.getDownloadUrl(
            safeUser.profile.panDocUrl,
          );
        if (safeUser.profile.certificateUrl)
          safeUser.profile.certificateUrl = await this.s3Service.getDownloadUrl(
            safeUser.profile.certificateUrl,
          );
        if (safeUser.profile.templeAffiliationProofUrl)
          safeUser.profile.templeAffiliationProofUrl =
            await this.s3Service.getDownloadUrl(
              safeUser.profile.templeAffiliationProofUrl,
            );

        // Attach serviceRadiusKm from the default service area
        if (safeUser.serviceAreas && safeUser.serviceAreas.length > 0) {
          const defaultArea =
            safeUser.serviceAreas.find((a: any) => a.isDefault) ||
            safeUser.serviceAreas[0];
          safeUser.profile.serviceRadiusKm = defaultArea.serviceRadiusKm;
        }
      } catch (e) {
        console.error(
          'Failed to generate pre-signed URL for profile documents:',
          e,
        );
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

    // Resolve state for user profile
    let userState: string | null = (safeUser as any)?.state || null;
    if (!userState) {
      if (user.role === USER_ROLE.PUROHIT) {
        const serviceAreas = (safeUser as any).serviceAreas;
        if (serviceAreas && serviceAreas.length > 0) {
          const defaultArea =
            serviceAreas.find((a: any) => a.isDefault) || serviceAreas[0];
          userState = defaultArea?.state || null;
        }
        if (!userState && (safeUser as any).profile?.state) {
          userState = (safeUser as any).profile.state;
        }
      } else if (user.role === USER_ROLE.CUSTOMER) {
        const addresses = (safeUser as any).addresses;
        if (addresses && addresses.length > 0) {
          const defaultAddress =
            addresses.find((a: any) => a.isDefault) || addresses[0];
          userState = defaultAddress?.state || null;
        }
      }
    }
    (safeUser as any).state = userState;
    if ((safeUser as any).profile) {
      (safeUser as any).profile.state =
        (safeUser as any).profile.state || userState;
      if (safeUser.role === USER_ROLE.ASTROLOGER) {
        (safeUser as any).astrologerProfile = (safeUser as any).profile;
      }
      (safeUser as any).verificationStatus =
        (safeUser as any).profile.verificationStatus;
      (safeUser as any).rejectionReason =
        (safeUser as any).profile.rejectionReason ?? null;
    }

    if (Array.isArray(safeUser.addresses)) {
      safeUser.addresses = this.sortCustomerAddresses(safeUser.addresses);
    }
    if (Array.isArray(safeUser.serviceAreas)) {
      safeUser.serviceAreas = this.sortServiceAreas(safeUser.serviceAreas);
    }
    if (Array.isArray((safeUser as any).bankAccounts)) {
      (safeUser as any).bankAccounts = this.sortBankAccounts((safeUser as any).bankAccounts);
    }

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

    // Invalidate session if user is blocked or rejected
    if (status === USER_STATUS.BLOCKED || status === USER_STATUS.REJECTED) {
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
      ![USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ADMIN, USER_ROLE.ASTROLOGER].includes(role)
    ) {
      throw new BadRequestException('Invalid role');
    }

    const trimmedPhone = phone?.trim();
    const normalizedEmail = email?.trim().toLowerCase();

    if (!trimmedPhone && !normalizedEmail) {
      throw new BadRequestException('Email or phone number is required');
    }

    const [existingUserByPhone, existingUserByEmail] = await Promise.all([
      trimmedPhone
        ? this.userRepository.findOne({ where: { phone: trimmedPhone } })
        : Promise.resolve(null),
      normalizedEmail
        ? this.userRepository.findByEmail(normalizedEmail)
        : Promise.resolve(null),
    ]);

    if (existingUserByPhone) {
      throw new ConflictException('Phone number already in use');
    }

    if (existingUserByEmail) {
      throw new ConflictException('Email already in use');
    }

    // Check resend cooldown / rate limiting
    let existingOtpRecord: Otp | null = null;
    if (trimmedPhone) {
      existingOtpRecord = await this.otpRepository.findOne({
        where: { phone: trimmedPhone },
        order: { id: 'DESC' },
      });
    } else if (normalizedEmail) {
      existingOtpRecord = await this.otpRepository.findOne({
        where: { email: normalizedEmail },
        order: { id: 'DESC' },
      });
    }

    if (existingOtpRecord && !existingOtpRecord.isVerified) {
      const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;
      const elapsedMs = Date.now() - new Date(existingOtpRecord.createdAt).getTime();
      if (elapsedMs < cooldownMs) {
        const remainingSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
        throw new BadRequestException(
          `Please wait ${remainingSec} second(s) before requesting another OTP.`,
        );
      }
    }

    // TODO: FAST2SMS_OTP_FIX - Previous non-cryptographic Math.random() OTP generation:
    // const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otp = generateSecureOtp(6);
    const hashedOtp = hashOtp(otp);

    const configuredExpiry = this.configService.get<string>('OTP_EXPIRY_SECONDS');
    const expirySeconds = configuredExpiry
      ? parseInt(configuredExpiry, 10)
      : DEFAULT_OTP_EXPIRY_SECONDS;

    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    let otpRecord: Otp;

    if (existingOtpRecord) {
      otpRecord = existingOtpRecord;
      otpRecord.otp = hashedOtp;
      otpRecord.attempts = 0;
      otpRecord.expiresAt = expiresAt;
      otpRecord.isVerified = false;
      otpRecord.role = role;
      otpRecord.otpType = OTP_TYPE.USER_REGISTRATION;

      if (trimmedPhone) {
        otpRecord.phone = trimmedPhone;
      }
      if (normalizedEmail) {
        otpRecord.email = normalizedEmail;
      }
    } else {
      otpRecord = this.otpRepository.create({
        phone: trimmedPhone,
        email: normalizedEmail,
        otp: hashedOtp,
        attempts: 0,
        expiresAt,
        isVerified: false,
        role,
        otpType: OTP_TYPE.USER_REGISTRATION,
      });
    }

    await this.otpRepository.save(otpRecord);

    if (trimmedPhone) {
      // ── Fast2SMS Smart OTP (WhatsApp primary / SMS fallback) ───────────────
      // Backend is single authority: backend generates OTP, stores hash, and
      // delivers the exact backend OTP through Fast2SMS.
      try {
        // TODO: FAST2SMS_MIGRATION - Previous call without backend OTP:
        // await this.smsService.sendOtpViaFast2sms(trimmedPhone);
        await this.smsService.sendOtpViaFast2sms(trimmedPhone, otp);
        this.logger.log(
          `[generateOtp] Fast2SMS OTP delivery request succeeded for phone ending …${trimmedPhone.slice(-4)}`,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[generateOtp] Fast2SMS OTP delivery failed for phone ending …${trimmedPhone.slice(-4)}: ${message}`,
        );
        if (normalizedEmail) {
          this.logger.log(
            `[generateOtp] Falling back to email OTP delivery for ${normalizedEmail}`,
          );
          try {
            await this.emailService.sendOtpEmail(normalizedEmail, otp);
            this.logger.log(
              `[generateOtp] Fallback OTP email sent successfully to ${normalizedEmail}`,
            );
          } catch (emailError: unknown) {
            // Clean up un-delivered OTP to avoid leaving system in inconsistent state
            await this.otpRepository.delete(otpRecord.id);
            const emailMessage =
              emailError instanceof Error ? emailError.message : String(emailError);
            this.logger.error(
              `[generateOtp] Fallback OTP email also failed for ${normalizedEmail}: ${emailMessage}`,
            );
            throw new InternalServerErrorException(
              'Failed to send OTP via WhatsApp/SMS and fallback email delivery failed',
            );
          }
        } else {
          // Clean up un-delivered OTP to avoid leaving system in inconsistent state
          await this.otpRepository.delete(otpRecord.id);
          throw new InternalServerErrorException(
            'Failed to send OTP via WhatsApp/SMS and no email provided for fallback',
          );
        }
      }

      // TODO: FAST2SMS_MIGRATION
      // Previous Twilio SMS OTP delivery — retained for rollback/reference.
      // Re-enable the block below and remove the Fast2SMS block above
      // if Fast2SMS integration needs to be rolled back.
      //
      // try {
      //   await this.smsService.sendOtpSms(trimmedPhone, otp);
      //   this.logger.log(`OTP SMS sent successfully to ${trimmedPhone}`);
      // } catch (error: any) {
      //   this.logger.error(
      //     `Failed to send OTP SMS to ${trimmedPhone}: ${error.message}`,
      //     error.stack,
      //   );
      //   if (normalizedEmail) {
      //     this.logger.log(`Falling back to email for OTP delivery to ${normalizedEmail}`);
      //     try {
      //       await this.emailService.sendOtpEmail(normalizedEmail, otp);
      //       this.logger.log(`Fallback OTP email sent successfully to ${normalizedEmail}`);
      //     } catch (emailError: any) {
      //       this.logger.error(
      //         `Failed to send fallback OTP email to ${normalizedEmail}: ${emailError.message}`,
      //         emailError.stack,
      //       );
      //       throw new InternalServerErrorException(
      //         'Failed to send OTP via SMS and fallback email delivery failed',
      //       );
      //     }
      //   } else {
      //     throw new InternalServerErrorException(
      //       'Failed to send OTP via SMS and no email provided for fallback',
      //     );
      //   }
      // }
    } else if (normalizedEmail) {
      try {
        await this.emailService.sendOtpEmail(normalizedEmail, otp);
        this.logger.log(`OTP email sent successfully to ${normalizedEmail}`);
      } catch (emailError: unknown) {
        await this.otpRepository.delete(otpRecord.id);
        const message =
          emailError instanceof Error ? emailError.message : String(emailError);
        this.logger.error(
          `Failed to send OTP email to ${normalizedEmail}: ${message}`,
        );
        throw new InternalServerErrorException('Failed to send OTP via email');
      }
    }

    return {
      success: true,
      message: 'OTP sent successfully',
      // TODO: SECURITY_FIX - Plaintext OTP must never be exposed in API responses.
      // Kept commented out for reference.
      // otp,
    };
  }



  async upsertPlatformSetting(dto: UpsertPlatformSettingDto, userId: number) {
    const existingSetting = await this.platformSettingRepository.findOne({
      where: { key: dto.key },
    });

    if (existingSetting) {
      const oldValue = {
        id: existingSetting.id,
        key: existingSetting.key,
        value: existingSetting.value,
        description: existingSetting.description,
      };

      existingSetting.value = dto.value;
      existingSetting.description = dto.description;
      existingSetting.updatedById = userId;

      const updatedSetting =
        await this.platformSettingRepository.save(existingSetting);

      const newValue = {
        id: updatedSetting.id,
        key: updatedSetting.key,
        value: updatedSetting.value,
        description: updatedSetting.description,
      };

      await this.auditLogService.createAuditLog({
        actorId: userId,
        actorType: ACTOR_TYPE.USER,
        actorRole: USER_ROLE.ADMIN,
        module: AUDIT_MODULE.SETTING,
        entity: 'PlatformSetting',
        entityId: String(updatedSetting.id),
        action: 'PLATFORM_SETTING_UPDATED',
        message: `Admin #${userId} updated platform setting '${updatedSetting.key}'.`,
        oldValue,
        newValue,
        metadata: {
          key: updatedSetting.key,
        },
      });

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

    const newValue = {
      id: savedSetting.id,
      key: savedSetting.key,
      value: savedSetting.value,
      description: savedSetting.description,
    };

    await this.auditLogService.createAuditLog({
      actorId: userId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SETTING,
      entity: 'PlatformSetting',
      entityId: String(savedSetting.id),
      action: 'PLATFORM_SETTING_CREATED',
      message: `Admin #${userId} created platform setting '${savedSetting.key}'.`,
      oldValue: undefined,
      newValue,
      metadata: {
        key: savedSetting.key,
      },
    });

    return {
      success: true,
      message: 'Platform setting created successfully',
      data: savedSetting,
    };
  }

  async uploadPlatformLogo(file: Express.Multer.File, userId: number) {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }

    const allowedMimeTypes = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid image format. Allowed formats: PNG, JPEG, WebP, SVG.',
      );
    }

    const ext = path.extname(file.originalname) || '.png';
    const filename = `platform/logo-${Date.now()}${ext}`;
    const logoUrl = await this.s3Service.uploadFile(
      filename,
      file.buffer,
      file.mimetype || 'image/png',
    );

    return this.upsertPlatformSetting(
      {
        key: PLATFORM_SETTING_KEY.PLATFORM_LOGO_URL,
        value: logoUrl,
        description: 'Main brand platform logo displayed in emails and invoices',
      },
      userId,
    );
  }

  async getPlatformSetting(userId?: number) {
    const existingAstrologyCommission = await this.platformSettingRepository.findOne({
      where: { key: PLATFORM_SETTING_KEY.ASTROLOGY_COMMISSION_PRICE },
    });

    if (!existingAstrologyCommission) {
      try {
        await this.platformSettingRepository.save(
          this.platformSettingRepository.create({
            key: PLATFORM_SETTING_KEY.ASTROLOGY_COMMISSION_PRICE,
            value: '50',
            description: 'Default platform commission price for astrology consultations',
            updatedById: userId,
          }),
        );
      } catch {
        // Ignore potential race condition
      }
    }

    const existingAstrologyCommPct = await this.platformSettingRepository.findOne({
      where: { key: PLATFORM_SETTING_KEY.ASTROLOGY_COMMISSION_PERCENTAGE },
    });

    if (!existingAstrologyCommPct) {
      try {
        await this.platformSettingRepository.save(
          this.platformSettingRepository.create({
            key: PLATFORM_SETTING_KEY.ASTROLOGY_COMMISSION_PERCENTAGE,
            value: '60',
            description: 'Default platform commission percentage for astrology consultations',
            updatedById: userId,
          }),
        );
      } catch {
        // Ignore potential race condition
      }
    }

    const existingLogoSetting = await this.platformSettingRepository.findOne({
      where: { key: PLATFORM_SETTING_KEY.PLATFORM_LOGO_URL },
    });

    if (!existingLogoSetting) {
      try {
        await this.platformSettingRepository.save(
          this.platformSettingRepository.create({
            key: PLATFORM_SETTING_KEY.PLATFORM_LOGO_URL,
            value: getPlatformLogoUrl(),
            description: 'Platform brand logo URL displayed across emails and invoices',
            updatedById: userId,
          }),
        );
      } catch {
        // Ignore potential race condition
      }
    }

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

    const oldValue = {
      id: setting.id,
      key: setting.key,
      value: setting.value,
      description: setting.description,
    };

    await this.platformSettingRepository.delete(id);

    await this.auditLogService.createAuditLog({
      actorId: userId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SETTING,
      entity: 'PlatformSetting',
      entityId: String(id),
      action: 'PLATFORM_SETTING_DELETED',
      message: `Admin #${userId} deleted platform setting '${setting.key}' (#${id}).`,
      oldValue,
      newValue: undefined,
      metadata: {
        key: setting.key,
      },
    });

    return {
      success: true,
      message: 'Platform setting deleted successfully',
    };
  }

  private enrichPurohitServicePlansPayout(service: any): void {
    if (!service) return;
    let plans = service.plans;
    if (typeof plans === 'string') {
      try {
        plans = JSON.parse(plans);
      } catch { }
    }
    if (plans && typeof plans === 'object' && !Array.isArray(plans)) {
      const effectiveCommission =
        service.commissionPercentage != null
          ? Number(service.commissionPercentage)
          : 10;
      const effectiveToken =
        service.tokenPercentage != null && Number(service.tokenPercentage) > 0
          ? Number(service.tokenPercentage)
          : 30;

      const enrichedPlans: Record<string, any> = {};
      for (const [key, plan] of Object.entries(plans as Record<string, any>)) {
        if (!plan || typeof plan !== 'object') {
          enrichedPlans[key] = plan;
          continue;
        }
        const planCopy = { ...plan };
        const planPrice = Number(planCopy.price);
        if (Number.isFinite(planPrice) && planPrice > 0) {
          const commission = Number(((planPrice * effectiveCommission) / 100).toFixed(2));
          const planPayout = Number((planPrice - commission).toFixed(2));
          planCopy.purohitPayoutAmount = planPayout;
          planCopy[`${key}PurohitPayoutAmount`] = planPayout;
          planCopy.tokenAmount = Number(((planPrice * effectiveToken) / 100).toFixed(2));

          if (key === 'basic') {
            service.basicPurohitPayoutAmount = planPayout;
          } else if (key === 'standard') {
            service.standardPurohitPayoutAmount = planPayout;
          }
        }
        enrichedPlans[key] = planCopy;
      }
      service.plans = enrichedPlans;
    }
  }

  private resolveUserCityAndState(user: any): { city: string | null; state: string | null } {
    let state: string | null = user?.state || null;
    let city: string | null = user?.city || null;

    if (user.role === USER_ROLE.PUROHIT) {
      const serviceAreas = (user.serviceAreas || []).filter((a: any) => !a.deletedAt);
      if (serviceAreas.length > 0) {
        const defaultArea =
          serviceAreas.find((a: any) => a.isDefault) ||
          serviceAreas[0];
        if (!state) state = defaultArea?.state || null;
        if (!city) city = defaultArea?.city || null;
      }
      if (!city && user.profile?.city) {
        city = user.profile.city;
      }
      if (!state && user.profile?.state) {
        state = user.profile.state;
      }
      const addresses = (user.addresses || []).filter((a: any) => !a.deletedAt);
      if (addresses.length > 0) {
        const defaultAddress =
          addresses.find((a: any) => a.isDefault) ||
          addresses[0];
        if (!state) state = defaultAddress?.state || null;
        if (!city) city = defaultAddress?.city || null;
      }
    } else if (user.role === USER_ROLE.ASTROLOGER) {
      if (!city && user.profile?.city) {
        city = user.profile.city;
      }
      if (!state && user.profile?.state) {
        state = user.profile.state;
      }
      const addresses = (user.addresses || []).filter((a: any) => !a.deletedAt);
      if (addresses.length > 0) {
        const defaultAddress =
          addresses.find((a: any) => a.isDefault) ||
          addresses[0];
        if (!state) state = defaultAddress?.state || null;
        if (!city) city = defaultAddress?.city || null;
      }
    } else if (user.role === USER_ROLE.CUSTOMER) {
      const addresses = (user.addresses || []).filter((a: any) => !a.deletedAt);
      if (addresses.length > 0) {
        const defaultAddress =
          addresses.find((a: any) => a.isDefault) ||
          addresses[0];
        if (!state) state = defaultAddress?.state || null;
        if (!city) city = defaultAddress?.city || null;
      }
    }

    return { city, state };
  }

  private formatProfileWithCityAndState(
    profile: any,
    userCity: string | null,
    userState: string | null,
  ): any {
    if (!profile) return profile;

    const resolvedCity = profile.city || userCity || null;
    const resolvedState = profile.state || userState || null;

    const orderedProfile: Record<string, any> = {};
    for (const [key, value] of Object.entries(profile)) {
      if (key === 'state') continue;
      if (key === 'city') {
        orderedProfile.city = resolvedCity;
        orderedProfile.state = resolvedState;
      } else {
        orderedProfile[key] = value;
      }
    }
    if (!('city' in orderedProfile)) {
      orderedProfile.city = resolvedCity;
      orderedProfile.state = resolvedState;
    }

    return orderedProfile;
  }

  private sortServiceAreas(serviceAreas: any[]): any[] {
    if (!Array.isArray(serviceAreas)) return [];
    return serviceAreas
      .filter((a: any) => !a.deletedAt)
      .sort((a: any, b: any) => {
        const aDefault = a.isDefault ? 1 : 0;
        const bDefault = b.isDefault ? 1 : 0;
        if (aDefault !== bDefault) {
          return bDefault - aDefault;
        }
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
  }

  private sortCustomerAddresses(addresses: any[]): any[] {
    if (!Array.isArray(addresses)) return [];
    return addresses
      .filter((a: any) => !a.deletedAt)
      .sort((a: any, b: any) => {
        const aDefault = a.isDefault ? 1 : 0;
        const bDefault = b.isDefault ? 1 : 0;
        if (aDefault !== bDefault) {
          return bDefault - aDefault;
        }
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
  }

  private sortBankAccounts(accounts: any[]): any[] {
    if (!Array.isArray(accounts)) return [];
    return accounts
      .filter((a: any) => !a.deletedAt)
      .sort((a: any, b: any) => {
        const aPrimary = a.isPrimary ? 1 : 0;
        const bPrimary = b.isPrimary ? 1 : 0;
        if (aPrimary !== bPrimary) {
          return bPrimary - aPrimary;
        }
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
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

        // TODO: VERCEL_BLOB_MIGRATION
        // Legacy S3 signed URL generation retained for rollback/reference.
        /*
        if (safeUser.profileImage) {
          safeUser.profileImage = await this.s3Service.getDownloadUrl(
            safeUser.profileImage,
          );
        }
        */
        // Active Vercel Blob implementation:
        // Stored public Blob URLs or existing URLs are returned directly.
        if ((safeUser as any).profile) {
          const profile = { ...(safeUser as any).profile };
          if (profile.aadhaarDocUrl) {
            profile.aadhaarDocDownloadUrl =
              await this.s3Service.getAttachmentDownloadUrl(
                profile.aadhaarDocUrl,
              );
            profile.aadhaarDocUrl = await this.s3Service.getDownloadUrl(
              profile.aadhaarDocUrl,
            );
          }
          if (profile.panDocUrl) {
            profile.panDocDownloadUrl =
              await this.s3Service.getAttachmentDownloadUrl(profile.panDocUrl);
            profile.panDocUrl = await this.s3Service.getDownloadUrl(
              profile.panDocUrl,
            );
          }
          if (profile.certificateUrl) {
            profile.certificateDownloadUrl =
              await this.s3Service.getAttachmentDownloadUrl(
                profile.certificateUrl,
              );
            profile.certificateUrl = await this.s3Service.getDownloadUrl(
              profile.certificateUrl,
            );
          }
          if (profile.templeAffiliationProofUrl) {
            profile.templeAffiliationProofDownloadUrl =
              await this.s3Service.getAttachmentDownloadUrl(
                profile.templeAffiliationProofUrl,
              );
            profile.templeAffiliationProofUrl =
              await this.s3Service.getDownloadUrl(
                profile.templeAffiliationProofUrl,
              );
          }
          if ((safeUser as any).purohitServices) {
            profile.purohitServices = await Promise.all(
              (safeUser as any).purohitServices.map(async (ps: any) => {
                let iconDownloadurl: string | null = null;
                if (ps.service?.iconUrl) {
                  try {
                    iconDownloadurl = await this.s3Service.getDownloadUrl(
                      ps.service.iconUrl,
                    );
                  } catch (e) { }
                }
                if (ps.service) {
                  this.enrichPurohitServicePlansPayout(ps.service);
                }
                const { purohitPayoutAmount: _psPayout, ...restPs } = ps;
                const { purohitPayoutAmount: _servicePayout, ...restService } = ps.service || {};
                return {
                  ...restPs,
                  service: {
                    ...restService,
                    iconDownloadurl,
                  },
                };
              }),
            );
            delete (safeUser as any).purohitServices;
          }
          (safeUser as any).profile = profile;
        }

        const { city: userCity, state: userState } = this.resolveUserCityAndState(safeUser);
        if ((safeUser as any).profile) {
          (safeUser as any).profile = this.formatProfileWithCityAndState(
            (safeUser as any).profile,
            userCity,
            userState,
          );
          if (safeUser.role === USER_ROLE.ASTROLOGER) {
            (safeUser as any).astrologerProfile = (safeUser as any).profile;
            delete (safeUser as any).profile;
          }
          delete (safeUser as any).city;
          delete (safeUser as any).state;
          delete (safeUser as any).purohitServices;
        } else {
          (safeUser as any).city = userCity;
          (safeUser as any).state = userState;
        }

        if (Array.isArray(safeUser.addresses)) {
          safeUser.addresses = this.sortCustomerAddresses(safeUser.addresses);
        }
        if (Array.isArray(safeUser.serviceAreas)) {
          safeUser.serviceAreas = this.sortServiceAreas(safeUser.serviceAreas);
        }
        if (Array.isArray((safeUser as any).bankAccounts)) {
          (safeUser as any).bankAccounts = this.sortBankAccounts((safeUser as any).bankAccounts);
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

    if ((otpRecord.attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      this.logger.warn(
        `[verifyOtp] Maximum verification attempts exceeded for ${phone ? `phone ending …${phone.slice(-4)}` : 'email'}`,
      );
      throw new BadRequestException(
        'Maximum verification attempts exceeded. Please request a new OTP.',
      );
    }

    // TODO: FAST2SMS_VERIFY_DEPRECATED
    // Fast2SMS is no longer the verification authority. Backend verifies against
    // stored secure hash as the single source of truth.
    // Retained for rollback reference:
    // if (phone) {
    //   const fast2smsVerified = await this.smsService.verifyOtpViaFast2sms(phone, otp);
    //   if (!fast2smsVerified) throw new BadRequestException('Invalid OTP');
    // }

    const isMatch = verifyOtpHash(otp, otpRecord.otp);

    if (!isMatch) {
      otpRecord.attempts = (otpRecord.attempts ?? 0) + 1;
      await this.otpRepository.save(otpRecord);
      this.logger.warn(
        `[verifyOtp] Invalid OTP submitted for ${phone ? `phone ending …${phone.slice(-4)}` : 'email'}. Attempt ${otpRecord.attempts}/${MAX_OTP_ATTEMPTS}`,
      );
      throw new BadRequestException('Invalid OTP');
    }

    otpRecord.isVerified = true;
    otpRecord.attempts = 0;
    const verifiedExpiresAt = new Date();
    verifiedExpiresAt.setMinutes(verifiedExpiresAt.getMinutes() + 30);
    otpRecord.expiresAt = verifiedExpiresAt;

    await this.otpRepository.save(otpRecord);

    this.logger.log(
      `[verifyOtp] OTP verification succeeded for ${phone ? `phone ending …${phone.slice(-4)}` : 'email'}`,
    );

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

    const dataWithServicesUrls = await Promise.all(
      result.data.map(async (user: any) => {
        // TODO: VERCEL_BLOB_MIGRATION
        // Legacy S3 signed URL generation retained for rollback/reference.
        /*
        let profileImage = user.profileImage;
        if (profileImage) {
          try {
            profileImage = await this.s3Service.getDownloadUrl(profileImage);
          } catch (e) { }
        }
        */
        // Active Vercel Blob implementation:
        const profileImage = user.profileImage;

        const purohitService = user.services
          ? user.services.map((ps: any) => {
            return {
              serviceName: ps.service?.name,
              // TODO: Deprecated with fixed service pricing. Purohit no longer sets custom prices.
              isOnlinePrice: ps.onlinePrice ?? ps.service?.plans?.basic?.price,
              isOfflinePrice: ps.offlinePrice ?? ps.service?.plans?.basic?.price,
              isOnlineAvailable: ps.isOnline,
              isOfflineAvailable: ps.isOffline,
              plans: ps.service?.plans ?? null,
              // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
              // priceWithoutSamagri: ps.service?.priceWithoutSamagri,
              // priceWithSamagri: ps.service?.priceWithSamagri,
            };
          })
          : [];

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
          purohitProfileId: user.profile?.id ?? null,
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
          state: user.profile?.state ?? null,
          purohitService,
        };
      }),
    );

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
    // TODO: VERCEL_BLOB_MIGRATION
    // Legacy S3 signed URL generation retained for rollback/reference.
    /*
    let profileImage = user.profileImage;

    if (profileImage) {
      profileImage = await this.s3Service.getDownloadUrl(profileImage);
    }
    */
    // Active Vercel Blob implementation:
    const profileImage = user.profileImage;

    let aadhaarDocUrl = profile?.aadhaarDocUrl;
    let aadhaarDocDownloadUrl;
    if (aadhaarDocUrl) {
      aadhaarDocDownloadUrl =
        await this.s3Service.getAttachmentDownloadUrl(aadhaarDocUrl);
      aadhaarDocUrl = await this.s3Service.getDownloadUrl(aadhaarDocUrl);
    }

    let panDocUrl = profile?.panDocUrl;
    let panDocDownloadUrl;
    if (panDocUrl) {
      panDocDownloadUrl =
        await this.s3Service.getAttachmentDownloadUrl(panDocUrl);
      panDocUrl = await this.s3Service.getDownloadUrl(panDocUrl);
    }

    let certificateUrl = profile?.certificateUrl;
    let certificateDownloadUrl;
    if (certificateUrl) {
      certificateDownloadUrl =
        await this.s3Service.getAttachmentDownloadUrl(certificateUrl);
      certificateUrl = await this.s3Service.getDownloadUrl(certificateUrl);
    }

    let templeAffiliationProofUrl = profile?.templeAffiliationProofUrl;
    let templeAffiliationProofDownloadUrl;
    if (templeAffiliationProofUrl) {
      templeAffiliationProofDownloadUrl =
        await this.s3Service.getAttachmentDownloadUrl(
          templeAffiliationProofUrl,
        );
      templeAffiliationProofUrl = await this.s3Service.getDownloadUrl(
        templeAffiliationProofUrl,
      );
    }

    const purohitService = profile?.purohitServices
      ? profile.purohitServices.map((ps) => {
        return {
          serviceName: ps.service?.name,
          // TODO: Deprecated with fixed service pricing. Purohit no longer sets custom prices.
          isOnlinePrice: ps.onlinePrice ?? ps.service?.plans?.basic?.price,
          isOfflinePrice: ps.offlinePrice ?? ps.service?.plans?.basic?.price,
          isOnlineAvailable: ps.isOnline,
          isOfflineAvailable: ps.isOffline,
          plans: ps.service?.plans ?? null,
          // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
          // priceWithoutSamagri: ps.service?.priceWithoutSamagri,
          // priceWithSamagri: ps.service?.priceWithSamagri,
        };
      })
      : [];

    return {
      success: true,
      message: 'Purohit fetched successfully',
      data: {
        id: user.id,
        purohitProfileId: profile?.id ?? null,
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
        state: profile?.state ?? null,
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
      const fullUser = await this.userRepository.getFullProfile(
        Number(id),
        user.role,
      );
      const { hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } =
        fullUser!;

      // TODO: VERCEL_BLOB_MIGRATION
      // Legacy S3 signed URL generation retained for rollback/reference.
      /*
      if (safeUser.profileImage) {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(
          safeUser.profileImage,
        );
      }
      */
      // Active Vercel Blob implementation:
      // Stored public Blob URLs or existing URLs are returned directly.
      if ((safeUser as any).profile) {
        const profile = { ...(safeUser as any).profile };
        if (profile.aadhaarDocUrl) {
          profile.aadhaarDocDownloadUrl =
            await this.s3Service.getAttachmentDownloadUrl(
              profile.aadhaarDocUrl,
            );
          profile.aadhaarDocUrl = await this.s3Service.getDownloadUrl(
            profile.aadhaarDocUrl,
          );
        }
        if (profile.panDocUrl) {
          profile.panDocDownloadUrl =
            await this.s3Service.getAttachmentDownloadUrl(profile.panDocUrl);
          profile.panDocUrl = await this.s3Service.getDownloadUrl(
            profile.panDocUrl,
          );
        }
        if (profile.certificateUrl) {
          profile.certificateDownloadUrl =
            await this.s3Service.getAttachmentDownloadUrl(
              profile.certificateUrl,
            );
          profile.certificateUrl = await this.s3Service.getDownloadUrl(
            profile.certificateUrl,
          );
        }
        if (profile.templeAffiliationProofUrl) {
          profile.templeAffiliationProofDownloadUrl =
            await this.s3Service.getAttachmentDownloadUrl(
              profile.templeAffiliationProofUrl,
            );
          profile.templeAffiliationProofUrl =
            await this.s3Service.getDownloadUrl(
              profile.templeAffiliationProofUrl,
            );
        }
        if ((safeUser as any).purohitServices) {
          profile.purohitServices = await Promise.all(
            (safeUser as any).purohitServices.map(async (ps: any) => {
              let iconDownloadurl: string | null = null;
              if (ps.service?.iconUrl) {
                try {
                  iconDownloadurl = await this.s3Service.getDownloadUrl(
                    ps.service.iconUrl,
                  );
                } catch (e) { }
              }
              if (ps.service) {
                this.enrichPurohitServicePlansPayout(ps.service);
              }
              const { purohitPayoutAmount: _psPayout, ...restPs } = ps;
              const { purohitPayoutAmount: _servicePayout, ...restService } = ps.service || {};
              return {
                ...restPs,
                service: {
                  ...restService,
                  iconDownloadurl,
                },
              };
            }),
          );
          delete (safeUser as any).purohitServices;
        }
        (safeUser as any).profile = profile;
        (safeUser as any).verificationStatus = profile.verificationStatus;
        (safeUser as any).rejectionReason = profile.rejectionReason ?? null;
      }

      const { city: userCity, state: userState } = this.resolveUserCityAndState(safeUser);
      if ((safeUser as any).profile) {
        (safeUser as any).profile = this.formatProfileWithCityAndState(
          (safeUser as any).profile,
          userCity,
          userState,
        );
        if (safeUser.role === USER_ROLE.ASTROLOGER) {
          (safeUser as any).astrologerProfile = (safeUser as any).profile;
          delete (safeUser as any).profile;
        }
        delete (safeUser as any).city;
        delete (safeUser as any).state;
        delete (safeUser as any).purohitServices;
      } else {
        (safeUser as any).city = userCity;
        (safeUser as any).state = userState;
      }

      if (Array.isArray(safeUser.addresses)) {
        safeUser.addresses = this.sortCustomerAddresses(safeUser.addresses);
      }
      if (Array.isArray(safeUser.serviceAreas)) {
        safeUser.serviceAreas = this.sortServiceAreas(safeUser.serviceAreas);
      }
      if (Array.isArray((safeUser as any).bankAccounts)) {
        (safeUser as any).bankAccounts = this.sortBankAccounts((safeUser as any).bankAccounts);
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

      const address = await this.dataSource.transaction(async (manager) => {
        await this.acquireOwnerLock(
          manager,
          ADVISORY_LOCK_NAMESPACE.CUSTOMER_ADDRESS,
          userId,
        );
        const addressRepo = manager.getRepository(CustomerAddress);

        let isDefault: boolean;
        if (dto.isDefault === true || (dto.isDefault as any) === 'true') {
          isDefault = true;
          await addressRepo.update(
            { customerId: userId, isDefault: true },
            { isDefault: false },
          );
        } else if (dto.isDefault === false || (dto.isDefault as any) === 'false') {
          isDefault = false;
        } else {
          // If isDefault is omitted, preserve existing business behavior
          const existingCount =
            typeof addressRepo.count === 'function'
              ? await addressRepo.count({
                where: { customerId: userId },
              })
              : (await addressRepo.find({ where: { customerId: userId } })).length;
          isDefault = existingCount === 0;
        }

        const { id: _ignoredId, ...addressPayload } = dto as any;
        const newAddress = addressRepo.create({
          customerId: userId,
          ...addressPayload,
          isDefault,
        } as DeepPartial<CustomerAddress>);

        const savedAddress = await addressRepo.save(newAddress);
        return savedAddress;
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
    } catch (error: unknown) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(
        'Error adding address:',
        error instanceof Error ? error.stack : String(error),
      );
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
      data: this.sortCustomerAddresses(data),
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

  async updateAddress(
    userId: number,
    id: number,
    dto: UpdateCustomerAddressDto,
  ) {
    const address = await this.customerAddressRepository.findById(id);

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.customerId !== userId) {
      throw new ForbiddenException('You can update only your own address');
    }

    const { id: _ignoredId, ...updatePayload } = dto as any;

    if (dto.isDefault === true || (dto.isDefault as any) === 'true') {
      await this.dataSource.transaction(async (manager) => {
        await this.acquireOwnerLock(
          manager,
          ADVISORY_LOCK_NAMESPACE.CUSTOMER_ADDRESS,
          userId,
        );
        const repo = manager.getRepository(CustomerAddress);
        await repo.update(
          { customerId: userId, isDefault: true },
          { isDefault: false },
        );
        await repo.update(id, {
          ...updatePayload,
          isDefault: true,
        });
      });
    } else {
      await this.customerAddressRepository.update(id, updatePayload);
    }

    const updated = await this.customerAddressRepository.findById(id);

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

    let autoDefaultAddressId: number | undefined;
    await this.dataSource.transaction(async (manager) => {
      await this.acquireOwnerLock(
        manager,
        ADVISORY_LOCK_NAMESPACE.CUSTOMER_ADDRESS,
        userId,
      );
      const repo = manager.getRepository(CustomerAddress);

      if (address.isDefault) {
        await repo.update(id, {
          isDefault: false,
        });
      }

      await repo.softDelete(id);

      const remainingAddresses = await repo.find({
        where: { customerId: userId } as any,
      });

      if (remainingAddresses.length === 1) {
        autoDefaultAddressId = remainingAddresses[0].id;
        await repo.update(autoDefaultAddressId, {
          isDefault: true,
        });
      }
    });

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
      newValue: {
        addressId: id,
        deleted: true,
        autoDefaultAddressId,
      },
    });

    return {
      success: true,
      message: 'Address deleted successfully',
    };
  }

  private async acquireOwnerLock(
    manager: EntityManager,
    namespace: number,
    ownerId: number,
  ): Promise<void> {
    if (typeof manager.query === 'function') {
      try {
        await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
          namespace,
          ownerId,
        ]);
      } catch (err) {
        this.logger.warn(
          `Could not acquire advisory lock (${namespace}, ${ownerId}): ${err}`,
        );
      }
    }
  }

  private normalizeCaller(
    callerOrUserId: { id: number; role?: USER_ROLE } | number,
  ): { id: number; role: USER_ROLE } {
    if (typeof callerOrUserId === 'number') {
      return { id: callerOrUserId, role: USER_ROLE.PUROHIT };
    }
    return {
      id: callerOrUserId.id,
      role: callerOrUserId.role || USER_ROLE.PUROHIT,
    };
  }

  async resolveTargetPurohitId(
    authenticatedUserId: number,
    role: USER_ROLE,
    requestedPurohitId?: number,
  ): Promise<number> {
    if (role === USER_ROLE.ADMIN) {
      if (!requestedPurohitId) {
        throw new BadRequestException('purohitId is required for admin');
      }

      let user = await this.userRepository.findById(requestedPurohitId);
      if (!user || user.role !== USER_ROLE.PUROHIT) {
        const profile = await this.purohitProfileRepository.findOne({
          where: { id: requestedPurohitId },
        });
        if (profile) {
          user = await this.userRepository.findById(profile.userId);
        }
      }

      if (!user || user.role !== USER_ROLE.PUROHIT) {
        throw new NotFoundException('Purohit not found');
      }

      return user.id;
    }

    if (role === USER_ROLE.PUROHIT) {
      // Never trust a purohitId supplied by a Purohit
      const user = await this.userRepository.findById(authenticatedUserId);
      if (!user || user.role !== USER_ROLE.PUROHIT) {
        throw new NotFoundException('Purohit not found');
      }
      return user.id;
    }

    throw new ForbiddenException('Access denied');
  }

  async addServiceArea(
    callerOrUserId: { id: number; role?: USER_ROLE } | number,
    dto: CreatePurohitServiceAreaDto,
    requestedPurohitId?: number,
  ) {
    const caller = this.normalizeCaller(callerOrUserId);
    const targetPurohitId = await this.resolveTargetPurohitId(
      caller.id,
      caller.role,
      requestedPurohitId ?? dto.purohitId,
    );

    const { purohitId: _ignored, ...createPayload } = dto;
    const area = await this.dataSource.transaction(async (manager) => {
      await this.acquireOwnerLock(
        manager,
        ADVISORY_LOCK_NAMESPACE.PUROHIT_SERVICE_AREA,
        targetPurohitId,
      );
      const areaRepo = manager.getRepository(PurohitServiceArea);

      let isDefault: boolean;
      if (
        dto.isDefault === true ||
        (dto.isDefault as any) === 'true' ||
        (dto.isDefault as any) === 1 ||
        (dto.isDefault as any) === '1'
      ) {
        isDefault = true;
      } else if (
        dto.isDefault === false ||
        (dto.isDefault as any) === 'false' ||
        (dto.isDefault as any) === 0 ||
        (dto.isDefault as any) === '0'
      ) {
        isDefault = false;
      } else {
        const existingCount =
          typeof areaRepo.count === 'function'
            ? await areaRepo.count({
              where: { purohitId: targetPurohitId },
            })
            : (await areaRepo.find({ where: { purohitId: targetPurohitId } })).length;
        isDefault = existingCount === 0;
      }

      if (isDefault) {
        await areaRepo.update(
          { purohitId: targetPurohitId, isDefault: true },
          { isDefault: false },
        );
      }

      const newArea = areaRepo.create({
        purohitId: targetPurohitId,
        ...createPayload,
        isDefault,
      });
      return areaRepo.save(newArea);
    });

    return {
      success: true,
      message: 'Service area added successfully',
      data: area,
    };
  }

  async getServiceAreaById(
    callerOrUserId: { id: number; role?: USER_ROLE } | number,
    id: number,
    requestedPurohitId?: number,
  ) {
    const caller = this.normalizeCaller(callerOrUserId);
    const area = await this.purohitServiceAreaRepository.findById(id);

    if (!area || area.deletedAt) {
      throw new NotFoundException('Service area not found');
    }

    if (caller.role === USER_ROLE.PUROHIT) {
      if (area.purohitId !== caller.id) {
        throw new ForbiddenException('You can access only your own service area');
      }
    } else if (caller.role === USER_ROLE.ADMIN) {
      if (requestedPurohitId) {
        const targetPurohitId = await this.resolveTargetPurohitId(
          caller.id,
          caller.role,
          requestedPurohitId,
        );
        if (area.purohitId !== targetPurohitId) {
          throw new NotFoundException('Service area is not mapped to this Purohit');
        }
      }
    } else {
      throw new ForbiddenException('Access denied');
    }

    return {
      success: true,
      message: 'Service area fetched successfully',
      data: area,
    };
  }

  async updateServiceArea(
    callerOrUserId: { id: number; role?: USER_ROLE } | number,
    id: number,
    dto: UpdatePurohitServiceAreaDto,
    requestedPurohitId?: number,
  ) {
    const caller = this.normalizeCaller(callerOrUserId);
    const area = await this.purohitServiceAreaRepository.findById(id);

    if (!area || area.deletedAt) {
      throw new NotFoundException('Service area not found');
    }

    if (caller.role === USER_ROLE.PUROHIT) {
      if (area.purohitId !== caller.id) {
        throw new ForbiddenException('You can update only your own service area');
      }
    } else if (caller.role === USER_ROLE.ADMIN) {
      const targetIdToValidate = requestedPurohitId ?? dto.purohitId;
      if (targetIdToValidate) {
        const targetPurohitId = await this.resolveTargetPurohitId(
          caller.id,
          caller.role,
          targetIdToValidate,
        );
        if (area.purohitId !== targetPurohitId) {
          throw new NotFoundException('Service area is not mapped to this Purohit');
        }
      }
    } else {
      throw new ForbiddenException('Access denied');
    }

    const { id: _ignoredId, purohitId: _ignoredPurohitId, ...updatePayload } = dto;
    let updated: PurohitServiceArea | null;

    const isSettingDefault =
      dto.isDefault === true ||
      (dto.isDefault as any) === 'true' ||
      (dto.isDefault as any) === 1 ||
      (dto.isDefault as any) === '1';

    if (isSettingDefault) {
      await this.dataSource.transaction(async (manager) => {
        await this.acquireOwnerLock(
          manager,
          ADVISORY_LOCK_NAMESPACE.PUROHIT_SERVICE_AREA,
          area.purohitId,
        );
        const areaRepo = manager.getRepository(PurohitServiceArea);
        await areaRepo.update(
          { purohitId: area.purohitId, isDefault: true },
          { isDefault: false },
        );
        await areaRepo.update(id, {
          ...(updatePayload as Partial<PurohitServiceArea>),
          isDefault: true,
        });
      });
      updated = await this.purohitServiceAreaRepository.findById(id);
    } else {
      updated = await this.purohitServiceAreaRepository.updateArea(
        id,
        updatePayload as Partial<PurohitServiceArea>,
      );
    }

    return {
      success: true,
      message: 'Service area updated successfully',
      data: updated,
    };
  }

  async getMyServiceAreas(
    callerOrUserId: { id: number; role?: USER_ROLE } | number,
    page: number = 1,
    limit: number = 10,
    search?: string,
    state?: string,
    requestedPurohitId?: number,
  ) {
    const caller = this.normalizeCaller(callerOrUserId);
    const targetPurohitId = await this.resolveTargetPurohitId(
      caller.id,
      caller.role,
      requestedPurohitId,
    );

    const { data, total } =
      await this.purohitServiceAreaRepository.findServiceAreas(
        targetPurohitId,
        page,
        limit,
        search,
        state,
      );

    return {
      success: true,
      message: 'Service areas fetched successfully',
      data: this.sortServiceAreas(data),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async deleteServiceArea(
    callerOrUserId: { id: number; role?: USER_ROLE } | number,
    id: number,
    requestedPurohitId?: number,
  ) {
    const caller = this.normalizeCaller(callerOrUserId);
    const area = await this.purohitServiceAreaRepository.findById(id);

    if (!area || area.deletedAt) {
      throw new NotFoundException('Service area not found');
    }

    if (caller.role === USER_ROLE.PUROHIT) {
      if (area.purohitId !== caller.id) {
        throw new ForbiddenException('You can delete only your own service area');
      }
    } else if (caller.role === USER_ROLE.ADMIN) {
      if (requestedPurohitId) {
        const targetPurohitId = await this.resolveTargetPurohitId(
          caller.id,
          caller.role,
          requestedPurohitId,
        );
        if (area.purohitId !== targetPurohitId) {
          throw new NotFoundException('Service area is not mapped to this Purohit');
        }
      }
    } else {
      throw new ForbiddenException('Access denied');
    }

    const wasDefault = Boolean(area.isDefault);

    await this.dataSource.transaction(async (manager) => {
      await this.acquireOwnerLock(
        manager,
        ADVISORY_LOCK_NAMESPACE.PUROHIT_SERVICE_AREA,
        area.purohitId,
      );
      const areaRepo = manager.getRepository(PurohitServiceArea);
      if (wasDefault) {
        await areaRepo.update(id, { isDefault: false });
      }
      await areaRepo.softDelete(id);

      if (wasDefault) {
        const remainingAreas = await areaRepo.find({
          where: { purohitId: area.purohitId },
          order: { createdAt: 'DESC' },
        });

        if (remainingAreas && remainingAreas.length > 0) {
          const nextDefaultArea = remainingAreas[0];
          await areaRepo.update(nextDefaultArea.id, { isDefault: true });
        }
      }
    });

    if (caller.role === USER_ROLE.ADMIN) {
      await this.auditLogService.createAuditLog({
        actorId: caller.id,
        actorType: ACTOR_TYPE.USER,
        actorRole: USER_ROLE.ADMIN,
        module: AUDIT_MODULE.USER,
        entity: 'PurohitServiceArea',
        entityId: String(id),
        action: 'PUROHIT_SERVICE_AREA_DELETED',
        message: `Admin #${caller.id} removed service area #${id} from Purohit #${area.purohitId}.`,
        oldValue: { serviceAreaId: id, city: area.city },
        newValue: undefined,
      });
    }

    return {
      success: true,
      message: 'Service area deleted successfully',
    };
  }

  hasValidPayoutMethod(account?: {
    accountNumber?: string | null;
    ifscCode?: string | null;
    accountHolderName?: string | null;
    upiId?: string | null;
  } | null): boolean {
    if (!account) return false;
    const hasValidUpi = Boolean(account.upiId && account.upiId.trim().includes('@'));
    const hasValidBank = Boolean(
      account.accountNumber &&
      account.accountNumber.trim().length >= 8 &&
      account.ifscCode &&
      account.ifscCode.trim().length >= 4 &&
      account.accountHolderName &&
      account.accountHolderName.trim().length > 0,
    );
    return hasValidUpi || hasValidBank;
  }

  async resolveTargetBankUser(
    authenticatedUserId: number,
    role: USER_ROLE,
    requestedUserId?: number,
  ): Promise<User> {
    if (role === USER_ROLE.ADMIN) {
      if (!requestedUserId) {
        throw new BadRequestException('userId is required for admin');
      }

      const user = await this.userRepository.findById(requestedUserId);

      if (!user || (user.role !== USER_ROLE.PUROHIT && user.role !== USER_ROLE.ASTROLOGER)) {
        throw new NotFoundException('User (Purohit or Astrologer) not found');
      }

      return user;
    }

    if (role === USER_ROLE.PUROHIT || role === USER_ROLE.ASTROLOGER) {
      const user = await this.userRepository.findById(authenticatedUserId);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return user;
    }

    throw new ForbiddenException('Access denied');
  }

  async addPurohitBankAccount(
    callerOrUserId: { id: number; role?: USER_ROLE } | number,
    dto: CreateBankAccountDto,
    requestedUserId?: number,
  ) {
    const caller = this.normalizeCaller(callerOrUserId);
    const targetUser = await this.resolveTargetBankUser(
      caller.id,
      caller.role,
      requestedUserId ?? dto.userId,
    );
    const targetUserId = targetUser.id;

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
      const existingAccount =
        await this.bankAccountRepository.findByAccountNumber(
          dto.accountNumber,
        );

      if (existingAccount && existingAccount.userId !== targetUserId) {
        throw new ConflictException('Bank account number already in use');
      }
    }

    const account = await this.dataSource.transaction(async (manager) => {
      await this.acquireOwnerLock(
        manager,
        ADVISORY_LOCK_NAMESPACE.PUROHIT_BANK_ACCOUNT,
        targetUserId,
      );

      const bankRepo = manager.getRepository(BankAccount);

      const existingAccounts = await bankRepo.find({ where: { userId: targetUserId } });

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
        await bankRepo.update(
          { userId: targetUserId, isPrimary: true },
          { isPrimary: false },
        );
      }

      let initialVerificationStatus = BANK_VERIFICATION_STATUS.PENDING;
      if (targetUser.role === USER_ROLE.PUROHIT) {
        const profile = await this.purohitProfileRepository.findOne({
          where: { userId: targetUserId },
        });
        if (profile?.verificationStatus === PUROHIT_VERIFICATION_STATUS.APPROVED) {
          initialVerificationStatus = BANK_VERIFICATION_STATUS.VERIFIED;
        }
      } else if (targetUser.role === USER_ROLE.ASTROLOGER) {
        const profile = await this.dataSource.getRepository(AstrologerProfile).findOne({
          where: { userId: targetUserId },
        });
        if (profile?.verificationStatus === PUROHIT_VERIFICATION_STATUS.APPROVED) {
          initialVerificationStatus = BANK_VERIFICATION_STATUS.VERIFIED;
        }
      }

      const payload = {
        userId: targetUserId,
        paymentMethod: dto.paymentMethod,
        accountHolderName: dto.accountHolderName,
        accountNumber: dto.accountNumber,
        ifscCode: dto.ifscCode,
        bankName: dto.bankName,
        accountType: dto.accountType,
        upiId: dto.upiId,
        isPrimary,
        verificationStatus: initialVerificationStatus,
      };

      const newAccount = bankRepo.create(payload);
      return bankRepo.save(newAccount);
    });

    await this.auditLogService.createAuditLog({
      actorId: caller.id,
      actorType: ACTOR_TYPE.USER,
      actorRole: caller.role,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: String(targetUserId),
      action: 'BANK_ACCOUNT_CREATED',
      message:
        caller.role === USER_ROLE.ADMIN
          ? `Admin #${caller.id} added a new bank account #${account.id} for User #${targetUserId}.`
          : `User #${caller.id} added a new bank account #${account.id}.`,
      oldValue: undefined,
      newValue: { bankAccountId: account.id },
    });

    if (targetUser.isAdminCreated) {
      if (targetUser.role === USER_ROLE.ASTROLOGER) {
        if (this.hasValidPayoutMethod(account)) {
          await this.userRepository.updateUser(String(targetUserId), {
            isAdminCreated: false,
          });
          targetUser.isAdminCreated = false;
        }
      } else if (targetUser.role === USER_ROLE.PUROHIT) {
        const profile = await this.purohitProfileRepository.findOne({
          where: { userId: targetUserId },
        });
        const hasDoc = Boolean(profile?.aadhaarDocUrl || profile?.panDocUrl);
        const hasBankOrUpi = Boolean(account.accountNumber || account.upiId);
        if (hasDoc && hasBankOrUpi) {
          await this.userRepository.updateUser(String(targetUserId), {
            isAdminCreated: false,
          });
          targetUser.isAdminCreated = false;
        }
      }
    }

    return {
      success: true,
      message: 'Bank account added successfully',
      data: account,
    };
  }

  async getPurohitBankAccounts(
    callerOrUserId: { id: number; role?: USER_ROLE } | number,
    page: number = 1,
    limit: number = 10,
    search?: string,
    requestedUserId?: number,
  ) {
    const caller = this.normalizeCaller(callerOrUserId);
    const targetUser = await this.resolveTargetBankUser(
      caller.id,
      caller.role,
      requestedUserId,
    );
    const targetUserId = targetUser.id;

    const { data, total } =
      await this.bankAccountRepository.findBankAccounts(
        targetUserId,
        page,
        limit,
        search,
      );

    return {
      success: true,
      message: 'Bank accounts fetched successfully',
      data: this.sortBankAccounts(data),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPurohitBankAccountById(
    callerOrUserId: { id: number; role?: USER_ROLE } | number | any,
    id: number,
    requestedUserId?: number,
  ) {
    const caller = this.normalizeCaller(callerOrUserId);
    const account = await this.bankAccountRepository.findById(id);

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    if (caller.role === USER_ROLE.ADMIN) {
      if (requestedUserId) {
        const targetUser = await this.resolveTargetBankUser(
          caller.id,
          caller.role,
          requestedUserId,
        );
        if (account.userId !== targetUser.id) {
          throw new NotFoundException('Bank account is not mapped to this user');
        }
      }
    } else if (caller.role === USER_ROLE.PUROHIT || caller.role === USER_ROLE.ASTROLOGER) {
      if (account.userId !== caller.id) {
        throw new ForbiddenException(
          'You can access only your own bank account',
        );
      }
    } else {
      throw new ForbiddenException('Access denied');
    }

    return {
      success: true,
      message: 'Bank account fetched successfully',
      data: account,
    };
  }

  async updatePurohitBankAccount(
    callerOrUserId: { id: number; role?: USER_ROLE } | number,
    id: number,
    dto: UpdateBankAccountDto,
    requestedUserId?: number,
  ) {
    const caller = this.normalizeCaller(callerOrUserId);
    const account = await this.bankAccountRepository.findById(id);

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    if (caller.role === USER_ROLE.ADMIN) {
      const targetIdToValidate = requestedUserId ?? dto.userId;
      if (targetIdToValidate) {
        const targetUser = await this.resolveTargetBankUser(
          caller.id,
          caller.role,
          targetIdToValidate,
        );
        if (account.userId !== targetUser.id) {
          throw new NotFoundException('Bank account is not mapped to this user');
        }
      }
    } else if (caller.role === USER_ROLE.PUROHIT || caller.role === USER_ROLE.ASTROLOGER) {
      if (account.userId !== caller.id) {
        throw new ForbiddenException('You can update only your own bank account');
      }
    } else {
      throw new ForbiddenException('Access denied');
    }

    if (dto.accountNumber && dto.accountNumber !== account.accountNumber) {
      const existingAccount =
        await this.bankAccountRepository.findByAccountNumber(
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

    const { userId: _ignoredUserId, ...updatePayload } = dto as any;

    const updatedData: Partial<BankAccount> = {
      ...updatePayload,
      ...(isPrimary !== undefined && { isPrimary }),
      verificationStatus: BANK_VERIFICATION_STATUS.PENDING,
    };

    await this.dataSource.transaction(async (manager) => {
      await this.acquireOwnerLock(
        manager,
        ADVISORY_LOCK_NAMESPACE.PUROHIT_BANK_ACCOUNT,
        account.userId,
      );

      const bankRepo = manager.getRepository(BankAccount);

      if (isPrimary === true) {
        await bankRepo.update(
          { userId: account.userId, isPrimary: true },
          { isPrimary: false },
        );
      }

      await bankRepo.update(id, updatedData);
    });

    const freshUpdatedAccount =
      await this.bankAccountRepository.findById(id);

    await this.auditLogService.createAuditLog({
      actorId: caller.id,
      actorType: ACTOR_TYPE.USER,
      actorRole: caller.role,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: String(account.userId),
      action: 'BANK_ACCOUNT_UPDATED',
      message:
        caller.role === USER_ROLE.ADMIN
          ? `Admin #${caller.id} updated bank account #${id} for User #${account.userId}.`
          : `User #${caller.id} updated bank account #${id}.`,
      oldValue: undefined,
      newValue: { bankAccountId: id },
    });

    const targetUser = await this.userRepository.findById(String(account.userId));
    if (targetUser?.isAdminCreated) {
      if (targetUser.role === USER_ROLE.ASTROLOGER) {
        if (this.hasValidPayoutMethod(freshUpdatedAccount)) {
          await this.userRepository.updateUser(String(account.userId), {
            isAdminCreated: false,
          });
          targetUser.isAdminCreated = false;
        }
      } else if (targetUser.role === USER_ROLE.PUROHIT) {
        const profile = await this.purohitProfileRepository.findOne({
          where: { userId: account.userId },
        });
        const hasDoc = Boolean(profile?.aadhaarDocUrl || profile?.panDocUrl);
        const hasBankOrUpi = Boolean(
          freshUpdatedAccount?.accountNumber ||
          freshUpdatedAccount?.upiId ||
          dto.accountNumber ||
          dto.upiId,
        );
        if (hasDoc && hasBankOrUpi) {
          await this.userRepository.updateUser(String(account.userId), {
            isAdminCreated: false,
          });
          targetUser.isAdminCreated = false;
        }
      }
    }

    return {
      success: true,
      message: 'Bank account updated successfully',
      data: freshUpdatedAccount,
    };
  }

  async deletePurohitBankAccount(
    callerOrUserId: { id: number; role?: USER_ROLE } | number,
    id: number,
    requestedUserId?: number,
  ) {
    const caller = this.normalizeCaller(callerOrUserId);
    const account = await this.bankAccountRepository.findById(id);

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    if (caller.role === USER_ROLE.ADMIN) {
      if (requestedUserId) {
        const targetUser = await this.resolveTargetBankUser(
          caller.id,
          caller.role,
          requestedUserId,
        );
        if (account.userId !== targetUser.id) {
          throw new NotFoundException('Bank account is not mapped to this user');
        }
      }
    } else if (caller.role === USER_ROLE.PUROHIT || caller.role === USER_ROLE.ASTROLOGER) {
      if (account.userId !== caller.id) {
        throw new ForbiddenException('You can delete only your own bank account');
      }
    } else {
      throw new ForbiddenException('Access denied');
    }

    const wasPrimary = account.isPrimary;

    await this.dataSource.transaction(async (manager) => {
      await this.acquireOwnerLock(
        manager,
        ADVISORY_LOCK_NAMESPACE.PUROHIT_BANK_ACCOUNT,
        account.userId,
      );

      const bankRepo = manager.getRepository(BankAccount);

      if (wasPrimary) {
        await bankRepo.update(id, { isPrimary: false });
      }

      await bankRepo.softDelete(id);

      if (wasPrimary) {
        const remainingAccounts = await bankRepo.find({
          where: { userId: account.userId },
          order: { id: 'ASC' },
        });

        if (remainingAccounts.length > 0) {
          await bankRepo.update(remainingAccounts[0].id, { isPrimary: true });
        }
      }
    });

    await this.auditLogService.createAuditLog({
      actorId: caller.id,
      actorType: ACTOR_TYPE.USER,
      actorRole: caller.role,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: String(account.userId),
      action: 'BANK_ACCOUNT_DELETED',
      message:
        caller.role === USER_ROLE.ADMIN
          ? `Admin #${caller.id} deleted bank account #${id} for User #${account.userId}.`
          : `User #${caller.id} deleted bank account #${id}.`,
      oldValue: { bankAccountId: id },
      newValue: { bankAccountId: id, deleted: true },
    });

    return {
      success: true,
      message: 'Bank account deleted successfully',
    };
  }

  addBankAccount = this.addPurohitBankAccount.bind(this);
  getBankAccounts = this.getPurohitBankAccounts.bind(this);
  getBankAccountById = this.getPurohitBankAccountById.bind(this);
  updateBankAccount = this.updatePurohitBankAccount.bind(this);
  deleteBankAccount = this.deletePurohitBankAccount.bind(this);

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
        PUROHIT_VERIFICATION_STATUS.REJECTED,
      ],
    };

    const isAllowed = allowedTransitions[currentStatus]?.includes(nextStatus);

    if (!isAllowed) {
      throw new BadRequestException(
        `Purohit verification status cannot be changed from ${currentStatus} to ${nextStatus}`,
      );
    }
  }


  checkProfileCompleteness(data: ProfileCompletenessCheckData): {
    isComplete: boolean;
    missingFields: string[];
  } {
    const missingFields: string[] = [];

    // 1. Basic user details
    if (!data.user?.firstName || this.isEmptyValue(data.user.firstName)) {
      missingFields.push('First name');
    }
    const hasEmail = Boolean(data.user?.email && !this.isEmptyValue(data.user.email));
    const hasPhone = Boolean(data.user?.phone && !this.isEmptyValue(data.user.phone));
    if (!hasEmail && !hasPhone) {
      missingFields.push('Email or Phone number');
    }

    // 2. City
    if (this.isEmptyValue(data.profile?.city)) {
      missingFields.push('City');
    }

    // 3. State
    if (this.isEmptyValue(data.profile?.state)) {
      missingFields.push('State');
    }

    // 4. Bio
    if (this.isEmptyValue(data.profile?.bio)) {
      missingFields.push('Bio');
    }

    // 5. Identity Document: Aadhaar OR PAN document
    const hasAadhaar = !this.isEmptyValue(data.profile?.aadhaarDocUrl);
    const hasPan = !this.isEmptyValue(data.profile?.panDocUrl);
    if (!hasAadhaar && !hasPan) {
      missingFields.push('Aadhaar or PAN document');
    }

    // 6. Bank Account OR UPI ID
    const accNum = data.bankAccount?.accountNumber?.trim();
    const ifsc = data.bankAccount?.ifscCode?.trim();
    const accHolder = data.bankAccount?.accountHolderName?.trim();
    const upi = data.bankAccount?.upiId?.trim();

    const hasValidBank = Boolean(
      accNum &&
      accNum.length >= 8 &&
      ifsc &&
      ifsc.length >= 4 &&
      accHolder &&
      accHolder.length > 0
    );
    const hasValidUpi = Boolean(
      upi &&
      upi.includes('@')
    );
    if (!hasValidBank && !hasValidUpi) {
      missingFields.push('Bank Account or UPI ID');
    }

    // 7. Service Area: Mandatory for Purohit only, NEVER for Astrologer
    if (data.role === USER_ROLE.PUROHIT) {
      let hasValidServiceArea = false;
      if (Array.isArray(data.serviceAreas) && data.serviceAreas.length > 0) {
        hasValidServiceArea = data.serviceAreas.some((area) => {
          if (typeof area === 'string') return area.trim().length > 0;
          if (typeof area === 'object' && area !== null) {
            return Boolean(area.city?.trim() || area.addressLabel?.trim() || area.id);
          }
          return false;
        });
      }
      if (!hasValidServiceArea) {
        missingFields.push('At least one valid service area');
      }
    }

    return {
      isComplete: missingFields.length === 0,
      missingFields,
    };
  }

  validateProfileCompleteness(data: ProfileCompletenessCheckData): void {
    const { isComplete, missingFields } = this.checkProfileCompleteness(data);
    if (!isComplete) {
      const entityLabel = data.role === USER_ROLE.PUROHIT ? 'Purohit' : 'Astrologer';
      throw new BadRequestException(
        `${entityLabel} profile cannot be approved. Missing required details: ${missingFields.join(', ')}`
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

  private validatePurohitForVerification(
    user: User,
    profile: PurohitProfile,
    media: PurohitMedia[],
    context: 'approval' | 'resubmission' = 'approval',
  ): void {
    const requiredFields: Record<string, unknown> = {
      email: user.email,
      'first name': user.firstName,
      // 'Aadhaar number': profile.aadhaarNumber,
      // TODO: Qualification certificate is optional as per business requirements
      // 'qualification certificate': profile.certificateUrl,
      // TODO: Qualification is optional as per business requirements
      // qualification: profile.qualification,
      experienceYears: profile.experienceYears,
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
      const prefix =
        context === 'resubmission'
          ? 'Please complete all required profile and verification information before resubmitting. Missing:'
          : 'Purohit cannot be approved. Missing required details:';
      throw new BadRequestException(
        `${prefix} ${missingFields.join(', ')}`,
      );
    }
    this.validatePurohitMedia(media);
  }

  private validatePurohitForApproval(
    user: User,
    profile: PurohitProfile,
    media: PurohitMedia[],
  ): void {
    this.validatePurohitForVerification(user, profile, media, 'approval');
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
    const bankAccountRepository = manager.getRepository(BankAccount);

    await userRepository
      .createQueryBuilder()
      .update(User)
      .set({
        status: USER_STATUS.ACTIVE,
        isAdminCreated: false,
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
      .update(BankAccount)
      .set({
        verificationStatus: BANK_VERIFICATION_STATUS.VERIFIED,
      })
      .where('"userId" = :userId', {
        userId,
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
    const bankAccountRepository = manager.getRepository(BankAccount);

    // TODO: PUROHIT_VERIFICATION_REWORK
    // Verification rejection must not reject/deactivate the User account.
    // User.status remains ACTIVE while PurohitProfile.verificationStatus = REJECTED.
    await userRepository
      .createQueryBuilder()
      .update(User)
      .set({
        status: USER_STATUS.ACTIVE,
        rejectionReason: () => 'NULL',
      })
      .where('id = :userId', { userId })
      .execute();

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
      .update(BankAccount)
      .set({
        verificationStatus: BANK_VERIFICATION_STATUS.FAILED,
      })
      .where('"userId" = :userId', {
        userId,
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

  private async sendAstrologerVerificationEmail(result: {
    userId: number;
    email?: string | null;
    firstName?: string | null;
    verificationStatus: PUROHIT_VERIFICATION_STATUS;
    rejectionReason: string | null;
  }): Promise<boolean> {
    const recipientEmail = result.email?.trim();

    this.logger.log(
      `Preparing astrologer verification email: ${JSON.stringify({
        userId: result.userId,
        email: recipientEmail,
        status: result.verificationStatus,
      })}`,
    );

    if (!recipientEmail) {
      this.logger.warn(
        `Astrologer user ${result.userId} does not have a valid email, skipping verification email`,
      );
      return false;
    }

    switch (result.verificationStatus) {
      case PUROHIT_VERIFICATION_STATUS.APPROVED:
        await this.emailService.sendAstrologerApprovalEmail(
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
        await this.emailService.sendAstrologerRejectionEmail(
          recipientEmail,
          result.rejectionReason,
          result.firstName ?? undefined,
        );
        break;

      default:
        throw new BadRequestException('Invalid verification status');
    }

    return true;
  }

  async verifyPurohitByAdmin(
    adminId: number,
    purohitUserId: number,
    dto: VerifyPurohitDto,
  ) {
    return this.verifyUserByAdmin(adminId, purohitUserId, dto);
  }

  async verifyUserByAdmin(
    adminId: number,
    targetUserId: number,
    dto: VerifyPurohitDto,
  ) {
    const rejectionReason = this.validateVerificationRequest(dto);

    const result = await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const profileRepository = manager.getRepository(PurohitProfile);
      const mediaRepository = manager.getRepository(PurohitMedia);
      const astrologerProfileRepository = manager.getRepository(AstrologerProfile);

      const admin = await userRepository.findOne({
        where: {
          id: adminId,
          role: USER_ROLE.ADMIN,
          status: USER_STATUS.ACTIVE,
        },
      });

      if (!admin) {
        throw new ForbiddenException(
          'Only an active admin can verify a user',
        );
      }

      const targetUser = await userRepository
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :targetUserId', {
          targetUserId,
        })
        .getOne();

      if (!targetUser) {
        throw new NotFoundException('User not found');
      }

      if (
        targetUser.role !== USER_ROLE.PUROHIT &&
        targetUser.role !== USER_ROLE.ASTROLOGER
      ) {
        throw new BadRequestException(
          'The selected user is neither a Purohit nor an Astrologer',
        );
      }

      if (targetUser.role === USER_ROLE.ASTROLOGER) {
        const astrologerProfile = await astrologerProfileRepository
          .createQueryBuilder('profile')
          .setLock('pessimistic_write')
          .where('profile.userId = :targetUserId', {
            targetUserId,
          })
          .getOne();

        if (!astrologerProfile) {
          throw new NotFoundException('Astrologer profile not found');
        }

        this.validatePurohitVerificationTransition(
          astrologerProfile.verificationStatus,
          dto.status,
        );

        const bankAccountRepository = manager.getRepository(BankAccount);

        switch (dto.status) {
          case PUROHIT_VERIFICATION_STATUS.APPROVED: {
            const bankAccount =
              (await bankAccountRepository.findOne({
                where: { userId: targetUserId, isPrimary: true },
              })) ||
              (await bankAccountRepository.findOne({
                where: { userId: targetUserId },
                order: { createdAt: 'DESC' },
              }));

            this.validateProfileCompleteness({
              role: USER_ROLE.ASTROLOGER,
              user: {
                firstName: targetUser.firstName,
                lastName: targetUser.lastName,
                email: targetUser.email,
                phone: targetUser.phone,
              },
              profile: {
                city: astrologerProfile.city,
                state: astrologerProfile.state,
                bio: astrologerProfile.bio,
                qualification: astrologerProfile.qualification,
                aadhaarDocUrl: astrologerProfile.aadhaarDocUrl,
                panDocUrl: astrologerProfile.panDocUrl,
              },
              bankAccount: bankAccount
                ? {
                    accountNumber: bankAccount.accountNumber,
                    ifscCode: bankAccount.ifscCode,
                    accountHolderName: bankAccount.accountHolderName,
                    upiId: bankAccount.upiId,
                  }
                : null,
              serviceAreas: null,
            });

            astrologerProfile.verificationStatus =
              PUROHIT_VERIFICATION_STATUS.APPROVED;
            astrologerProfile.rejectionReason = undefined;
            targetUser.isAdminCreated = false;
            await manager.save(User, targetUser);
            await manager.save(AstrologerProfile, astrologerProfile);

            await bankAccountRepository
              .createQueryBuilder()
              .update(BankAccount)
              .set({
                verificationStatus: BANK_VERIFICATION_STATUS.VERIFIED,
              })
              .where('"userId" = :userId', {
                userId: targetUserId,
              })
              .andWhere('"deletedAt" IS NULL')
              .execute();
            break;
          }

          case PUROHIT_VERIFICATION_STATUS.REJECTED:
            astrologerProfile.verificationStatus =
              PUROHIT_VERIFICATION_STATUS.REJECTED;
            astrologerProfile.rejectionReason = rejectionReason!;
            await manager.save(AstrologerProfile, astrologerProfile);

            await bankAccountRepository
              .createQueryBuilder()
              .update(BankAccount)
              .set({
                verificationStatus: BANK_VERIFICATION_STATUS.FAILED,
              })
              .where('"userId" = :userId', {
                userId: targetUserId,
              })
              .andWhere('"deletedAt" IS NULL')
              .execute();
            break;

          default:
            throw new BadRequestException('Invalid Astrologer verification status');
        }

        const bankVerificationStatus =
          dto.status === PUROHIT_VERIFICATION_STATUS.APPROVED
            ? BANK_VERIFICATION_STATUS.VERIFIED
            : BANK_VERIFICATION_STATUS.FAILED;

        return {
          userId: targetUser.id,
          profileId: astrologerProfile.id,
          role: USER_ROLE.ASTROLOGER,
          email: targetUser.email,
          firstName: targetUser.firstName,
          userStatus: USER_STATUS.ACTIVE,
          verificationStatus: dto.status,
          bankVerificationStatus,
          rejectionReason:
            dto.status === PUROHIT_VERIFICATION_STATUS.REJECTED
              ? rejectionReason!
              : null,
        };
      }

      // PUROHIT verification flow
      const profile = await profileRepository
        .createQueryBuilder('profile')
        .setLock('pessimistic_write')
        .where('profile.userId = :targetUserId', {
          targetUserId,
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
        case PUROHIT_VERIFICATION_STATUS.APPROVED: {
          const bankAccountRepo = manager.getRepository(BankAccount);
          const bankAccount =
            (await bankAccountRepo.findOne({
              where: { userId: targetUserId, isPrimary: true },
            })) ||
            (await bankAccountRepo.findOne({
              where: { userId: targetUserId },
              order: { createdAt: 'DESC' },
            }));

          const serviceAreaRepo = manager.getRepository(PurohitServiceArea);
          const serviceAreas = await serviceAreaRepo.find({
            where: { purohitId: targetUserId },
          });

          const defaultArea = serviceAreas.find((a) => (a as any).isDefault) || serviceAreas[0];
          this.validateProfileCompleteness({
            role: USER_ROLE.PUROHIT,
            user: {
              firstName: targetUser.firstName,
              lastName: targetUser.lastName,
              email: targetUser.email,
              phone: targetUser.phone,
            },
            profile: {
              city: profile.city || defaultArea?.city,
              state: profile.state || (defaultArea as any)?.state,
              bio: profile.bio,
              qualification: profile.qualification,
              aadhaarDocUrl: profile.aadhaarDocUrl,
              panDocUrl: profile.panDocUrl,
              certificateUrl: profile.certificateUrl,
            },
            bankAccount: bankAccount
              ? {
                  accountNumber: bankAccount.accountNumber,
                  ifscCode: bankAccount.ifscCode,
                  accountHolderName: bankAccount.accountHolderName,
                  upiId: bankAccount.upiId,
                }
              : null,
            serviceAreas,
          });

          this.validatePurohitForApproval(targetUser, profile, media);

          await this.approvePurohit(manager, targetUser.id, profile.id);
          break;
        }

        case PUROHIT_VERIFICATION_STATUS.REJECTED:
          await this.rejectPurohit(
            manager,
            targetUser.id,
            profile.id,
            rejectionReason!,
          );
          break;

        default:
          throw new BadRequestException('Invalid Purohit verification status');
      }

      const userStatus = USER_STATUS.ACTIVE;
      const mediaStatus =
        dto.status === PUROHIT_VERIFICATION_STATUS.APPROVED
          ? PUROHIT_MEDIA_VERIFICATION_STATUS.APPROVED
          : PUROHIT_MEDIA_VERIFICATION_STATUS.REJECTED;
      const bankVerificationStatus =
        dto.status === PUROHIT_VERIFICATION_STATUS.APPROVED
          ? BANK_VERIFICATION_STATUS.VERIFIED
          : BANK_VERIFICATION_STATUS.FAILED;

      return {
        userId: targetUser.id,
        profileId: profile.id,
        role: USER_ROLE.PUROHIT,
        email: targetUser.email,
        firstName: targetUser.firstName,
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

    const isAstrologer = result.role === USER_ROLE.ASTROLOGER;
    const roleLabel = isAstrologer ? 'Astrologer' : 'Purohit';

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.USER,
      entity: 'User',
      entityId: String(targetUserId),
      action: 'USER_STATUS_CHANGED',
      message: `Admin verified ${roleLabel} #${targetUserId}. Status changed to ${dto.status}.`,
      oldValue: undefined,
      newValue: {
        status: dto.status,
        rejectionReason:
          dto.status === PUROHIT_VERIFICATION_STATUS.REJECTED
            ? rejectionReason
            : null,
      },
    });

    let emailSent = false;
    if (isAstrologer) {
      emailSent = await this.sendAstrologerVerificationEmail(result);
    } else {
      emailSent = await this.sendPurohitVerificationEmail(result as any);
    }

    const isApproved =
      result.verificationStatus === PUROHIT_VERIFICATION_STATUS.APPROVED;

    if (this.notificationService) {
      try {
        await this.notificationService.createNotification(
          result.userId,
          isApproved
            ? `${roleLabel} Profile Approved`
            : `${roleLabel} Profile Verification Update`,
          isApproved
            ? `Congratulations! Your ${roleLabel} profile has been verified and approved.`
            : `Your ${roleLabel} profile verification was rejected: ${dto.rejectionReason || ''}`,
          NOTIFICATION_TYPE.SYSTEM,
          result.profileId,
          isAstrologer ? 'ASTROLOGER_PROFILE' : 'PUROHIT_PROFILE',
        );
      } catch (err: any) {
        this.logger.warn(
          `Failed to send ${roleLabel.toLowerCase()} verification notification: ${err?.message}`,
        );
      }
    }

    return {
      success: true,
      message: isApproved
        ? `${roleLabel} approved successfully`
        : `${roleLabel} rejected successfully`,
      data: {
        userId: result.userId,
        profileId: result.profileId,
        userStatus: result.userStatus,
        verificationStatus: result.verificationStatus,
        bankVerificationStatus: (result as any).bankVerificationStatus,
        ...(result.role === USER_ROLE.PUROHIT && {
          mediaStatus: (result as any).mediaStatus,
          updatedMediaCount: (result as any).updatedMediaCount,
        }),
        rejectionReason: result.rejectionReason,
        emailSent,
      },
    };
  }

  // TODO: PUROHIT_VERIFICATION_RESUBMIT
  // Resubmission is now handled through the existing Edit Profile API (updateProfileByUser).
  // Separate resubmit endpoint is intentionally not required.

  private async syncPurohitMediaDocuments(
    purohitProfileId: number,
    docs: {
      aadhaarDocUrl?: string;
      panDocUrl?: string;
      certificateUrl?: string;
      templeAffiliationProofUrl?: string;
    },
    verificationStatus: PUROHIT_MEDIA_VERIFICATION_STATUS = PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING,
    manager?: EntityManager,
  ): Promise<void> {
    const mediaRepo = (manager ? manager.getRepository(PurohitMedia) : null) || this.purohitMediaRepository;

    const mappings: Array<{ docType: string; url?: string }> = [
      { docType: 'AADHAAR', url: docs.aadhaarDocUrl },
      { docType: 'PAN', url: docs.panDocUrl },
      { docType: 'CERTIFICATE', url: docs.certificateUrl },
      { docType: 'TEMPLE_PROOF', url: docs.templeAffiliationProofUrl },
    ];

    for (const item of mappings) {
      if (!item.url) continue;

      const existingMedia = await mediaRepo.findOne({
        where: {
          purohitId: purohitProfileId,
          documentType: item.docType,
        },
      });

      if (existingMedia) {
        await mediaRepo.update(existingMedia.id, {
          mediaUrl: item.url,
          verificationStatus,
          rejectionReason: () => 'NULL',
        });
      } else {
        const newMedia = mediaRepo.create({
          purohitId: purohitProfileId,
          mediaType: PUROHIT_MEDIA_TYPE.IMAGE,
          documentType: item.docType,
          mediaUrl: item.url,
          verificationStatus,
        });
        await mediaRepo.save(newMedia);
      }
    }
  }

  async createCustomerByAdmin(dto: CreateCustomerByAdminDto) {
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
      const addressRepository = manager.getRepository(CustomerAddress);

      const username =
        dto.firstName.replace(/\s+/g, '') + Math.floor(Math.random() * 1000);

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

      if (dto.address || dto.city || dto.state) {
        const address = addressRepository.create({
          customer: savedUser,
          fullAddress: dto.address || 'N/A',
          city: dto.city || 'N/A',
          state: dto.state || undefined,
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
        dto.password,
      );
    }

    return {
      success: true,
      message: 'Customer created successfully',
      data: result,
    };
  }

  async createPurohitByAdmin(
    dto: CreatePurohitByAdminDto,
    files?: {
      profileImage?: Express.Multer.File[];
      aadhaarDoc?: Express.Multer.File[];
      panDoc?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
      templeAffiliationProof?: Express.Multer.File[];
    },
  ) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        'At least email or phone number must be provided',
      );
    }

    if (dto.confirmPassword && dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    if (dto.phone) {
      const existingUserByPhone = await this.userRepository.findOne({
        where: { phone: dto.phone.trim() },
      });
      if (existingUserByPhone)
        throw new ConflictException('Phone number already in use');
    }
    if (dto.email) {
      const existingUserByEmail = await this.userRepository.findByEmail(
        dto.email.trim().toLowerCase(),
      );
      if (existingUserByEmail)
        throw new ConflictException('Email already in use');
    }

    const aadhaarFiles = (files as any)?.aadhaarDoc?.filter(
      (f: Express.Multer.File) => f && f.buffer && f.buffer.length > 0,
    );
    const panFiles = (files as any)?.panDoc?.filter(
      (f: Express.Multer.File) => f && f.buffer && f.buffer.length > 0,
    );
    const certificateFiles = (files as any)?.certificate?.filter(
      (f: Express.Multer.File) => f && f.buffer && f.buffer.length > 0,
    );
    const templeFiles = (files as any)?.templeAffiliationProof?.filter(
      (f: Express.Multer.File) => f && f.buffer && f.buffer.length > 0,
    );
    const profileImageFile = (files as any)?.profileImage?.[0];

    let aadhaarDocUrl = (dto.aadhaarDocUrl ?? dto.aadhaarDoc)?.trim() || null;
    let panDocUrl = (dto.panDocUrl ?? dto.panDoc)?.trim() || null;
    let certificateUrl = (dto.certificateUrl ?? dto.certificate)?.trim() || null;
    let templeAffiliationProofUrl = (dto.templeAffiliationProofUrl ?? dto.templeAffiliationProof)?.trim() || null;

    let aadhaarNumber = dto.aadhaarNumber?.trim() || null;
    if (aadhaarNumber) {
      const cleanAadhaar = aadhaarNumber.replace(/[\s-]/g, '');
      if (!isValidAadhaar(cleanAadhaar)) {
        throw new BadRequestException(
          'aadhaarNumber must be a valid Aadhaar number',
        );
      }
      aadhaarNumber = cleanAadhaar;
      const existingAadhaar = await this.purohitProfileRepository.findOne({
        where: { aadhaarNumber },
      });
      if (existingAadhaar) {
        throw new ConflictException('Aadhaar number already in use');
      }
    }

    const bankData = (dto as any).bankAccount || ((dto as any).bankAccounts && (dto as any).bankAccounts[0]) || {};
    const accountHolderName = (dto.accountHolderName ?? bankData.accountHolderName)?.trim() || null;
    const accountNumber = (dto.accountNumber ?? bankData.accountNumber)?.trim() || null;
    const ifscCode = (dto.ifscCode ?? bankData.ifscCode)?.trim() || null;
    const bankName = (dto.bankName ?? bankData.bankName)?.trim() || null;
    const upiId = (dto.upiId ?? bankData.upiId)?.trim() || null;
    const paymentMethod = dto.paymentMethod ?? bankData.paymentMethod ?? (upiId ? PUROHIT_PAYMENT_METHOD.UPI : PUROHIT_PAYMENT_METHOD.BANK);

    if (accountNumber) {
      const existingAccount = await this.bankAccountRepository.findByAccountNumber(accountNumber);
      if (existingAccount) {
        throw new ConflictException('Bank account number already in use');
      }
    }

    const rawQualification = dto.qualification ?? dto.education;
    const parsedQual = parseStringArray(rawQualification) || (Array.isArray(rawQualification) ? rawQualification : (rawQualification ? [rawQualification] : null));

    let combinedAreas = dto.serviceAreas;
    if (!combinedAreas || combinedAreas.length === 0) {
      if (dto.serviceArea) {
        let parsed = dto.serviceArea;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            parsed = [parsed];
          }
        }
        combinedAreas = Array.isArray(parsed) ? parsed : [parsed];
      } else if (dto.fullAddress) {
        combinedAreas = [{
          fullAddress: dto.fullAddress,
          addressLabel: dto.addressLabel || 'PRIMARY',
          streetName: dto.streetName || dto.fullAddress.split(',')[0].trim(),
          city: dto.city || 'City',
          state: dto.state,
          pincode: dto.pincode || '000000',
          latitude: dto.latitude,
          longitude: dto.longitude,
          serviceRadiusKm: dto.serviceRadiusKm || 10,
          isDefault: dto.isDefault ?? true,
        }];
      }
    }

    const hasAadhaar = !combinedAreas ? false : !!(aadhaarDocUrl || (aadhaarFiles && aadhaarFiles.length > 0));
    const hasPan = !combinedAreas ? false : !!(panDocUrl || (panFiles && panFiles.length > 0));

    const completeness = this.checkProfileCompleteness({
      role: USER_ROLE.PUROHIT,
      user: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
      },
      profile: {
        city: dto.city,
        state: dto.state,
        bio: dto.bio,
        qualification: parsedQual,
        aadhaarDocUrl: hasAadhaar ? (aadhaarDocUrl || 'pending_file') : (aadhaarDocUrl || null),
        panDocUrl: hasPan ? (panDocUrl || 'pending_file') : (panDocUrl || null),
      },
      bankAccount: {
        accountNumber,
        ifscCode,
        accountHolderName,
        upiId,
      },
      serviceAreas: combinedAreas,
    });
    const isComplete = completeness.isComplete;

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const result = await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);

      const username =
        dto.username?.trim() ||
        (dto.firstName.replace(/\s+/g, '') + Math.floor(Math.random() * 1000));

      let userProfileImage = dto.profileImage?.trim() || undefined;

      const user = userRepository.create({
        username,
        email: dto.email?.trim().toLowerCase(),
        phone: dto.phone?.trim(),
        countryCode: dto.countryCode?.trim(),
        hashedPassword,
        role: USER_ROLE.PUROHIT,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        status: USER_STATUS.ACTIVE,
        isAdminCreated: !isComplete,
        dob: dto.dob ? new Date(dto.dob) : undefined,
        profileImage: userProfileImage,
      });

      const savedUser = await userRepository.save(user);

      if (profileImageFile && profileImageFile.buffer && profileImageFile.buffer.length > 0) {
        try {
          const imageUrl = await this.s3Service.uploadProfileImage(
            savedUser.id,
            profileImageFile,
          );
          savedUser.profileImage = imageUrl;
          await userRepository.save(savedUser);
        } catch (e) {
          this.logger.warn(`Failed to upload profileImage: ${e}`);
        }
      }

      if (aadhaarFiles?.length) {
        try {
          aadhaarDocUrl = (await this.s3Service.uploadFileHelper(
            savedUser.id,
            'aadhaarDoc',
            aadhaarFiles,
          )) || aadhaarDocUrl;
        } catch (e) {
          this.logger.warn(`Failed to upload aadhaarDoc: ${e}`);
        }
      }
      if (panFiles?.length) {
        try {
          panDocUrl = (await this.s3Service.uploadFileHelper(
            savedUser.id,
            'panDoc',
            panFiles,
          )) || panDocUrl;
        } catch (e) {
          this.logger.warn(`Failed to upload panDoc: ${e}`);
        }
      }
      if (certificateFiles?.length) {
        try {
          certificateUrl = (await this.s3Service.uploadFileHelper(
            savedUser.id,
            'certificate',
            certificateFiles,
          )) || certificateUrl;
        } catch (e) {
          this.logger.warn(`Failed to upload certificate: ${e}`);
        }
      }
      if (templeFiles?.length) {
        try {
          templeAffiliationProofUrl = (await this.s3Service.uploadFileHelper(
            savedUser.id,
            'templeAffiliationProof',
            templeFiles,
          )) || templeAffiliationProofUrl;
        } catch (e) {
          this.logger.warn(`Failed to upload templeAffiliationProof: ${e}`);
        }
      }

      const isOnlineAvailable = dto.isOnlineAvailable === true || dto.isOnlineAvailable === 'true';
      const isOfflineAvailable = dto.isOfflineAvailable === true || dto.isOfflineAvailable === 'true';

      const profile = manager.create(PurohitProfile, {
        userId: savedUser.id,
        city: dto.city?.trim(),
        state: dto.state?.trim(),
        bio: dto.bio?.trim(),
        qualification: parsedQual || undefined,
        experienceYears: dto.experienceYears ? Number(dto.experienceYears) : undefined,
        languages: dto.languages,
        specializations: dto.specializations,
        aadhaarNumber: aadhaarNumber || undefined,
        aadhaarDocUrl: aadhaarDocUrl || undefined,
        panDocUrl: panDocUrl || undefined,
        certificateUrl: certificateUrl || undefined,
        templeAffiliationProofUrl: templeAffiliationProofUrl || undefined,
        isOnlineAvailable,
        isOfflineAvailable,
        verificationStatus: isComplete
          ? PUROHIT_VERIFICATION_STATUS.APPROVED
          : PUROHIT_VERIFICATION_STATUS.PENDING,
        rejectionReason: null as any,
      });
      const savedProfile = await manager.save(profile);

      const hasAnyBankData = Boolean(
        accountNumber ||
        upiId ||
        accountHolderName ||
        ifscCode ||
        bankName
      );

      let newAccount: BankAccount | null = null;
      if (hasAnyBankData) {
        const bankRepo = manager.getRepository(BankAccount);
        newAccount = bankRepo.create({
          userId: savedUser.id,
          accountHolderName: accountHolderName || '',
          accountNumber: accountNumber || '',
          ifscCode: ifscCode || '',
          bankName: bankName || '',
          accountType: (dto as any).accountType || undefined,
          paymentMethod,
          upiId: upiId || null,
          isPrimary: true,
          verificationStatus: isComplete
            ? BANK_VERIFICATION_STATUS.VERIFIED
            : BANK_VERIFICATION_STATUS.PENDING,
        });
        await bankRepo.save(newAccount);
      }

      if (aadhaarDocUrl || panDocUrl || certificateUrl || templeAffiliationProofUrl) {
        await this.syncPurohitMediaDocuments(
          savedProfile.id,
          {
            aadhaarDocUrl: aadhaarDocUrl || undefined,
            panDocUrl: panDocUrl || undefined,
            certificateUrl: certificateUrl || undefined,
            templeAffiliationProofUrl: templeAffiliationProofUrl || undefined,
          },
          isComplete
            ? PUROHIT_MEDIA_VERIFICATION_STATUS.APPROVED
            : PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING,
          manager,
        );
      }

      const createdServices: PurohitService[] = [];
      if (dto.services && dto.services.length > 0) {
        const uniqueServiceIds = Array.from(new Set(dto.services));
        const serviceRepo = manager.getRepository(Service);
        const foundServices = await serviceRepo.find({
          where: { id: In(uniqueServiceIds) },
        });
        if (foundServices.length !== uniqueServiceIds.length) {
          const foundIds = new Set(foundServices.map((s) => s.id));
          const missingIds = uniqueServiceIds.filter((sId) => !foundIds.has(sId));
          throw new NotFoundException(`Services not found: ${missingIds.join(', ')}`);
        }

        const purohitServiceRepo = manager.getRepository(PurohitService);
        for (const serviceId of uniqueServiceIds) {
          const ps = purohitServiceRepo.create({
            purohitId: savedProfile.id,
            serviceId,
            isActive: true,
            isOnline: false,
            isOffline: true,
          });
          createdServices.push(await purohitServiceRepo.save(ps));
        }
      }

      const createdAreas: PurohitServiceArea[] = [];
      if (combinedAreas && combinedAreas.length > 0) {
        const areaRepo = manager.getRepository(PurohitServiceArea);
        let isFirst = true;
        for (const rawArea of combinedAreas) {
          if (typeof rawArea === 'string' && rawArea.trim().length > 0) {
            const areaName = rawArea.trim();
            const area = areaRepo.create({
              purohitId: savedUser.id,
              addressLabel: areaName,
              streetName: areaName,
              fullAddress: areaName,
              city: areaName,
              pincode: '000000',
              isDefault: isFirst,
              serviceRadiusKm: 10,
            });
            createdAreas.push(await areaRepo.save(area));
            isFirst = false;
          } else if (typeof rawArea === 'object' && rawArea !== null) {
            const areaObj = rawArea;
            const area = areaRepo.create({
              purohitId: savedUser.id,
              addressLabel: areaObj.addressLabel?.trim() || areaObj.city?.trim() || 'Service Area',
              streetName: areaObj.streetName?.trim() || areaObj.city?.trim() || 'Main Street',
              fullAddress: areaObj.fullAddress?.trim() || areaObj.city?.trim() || 'Service Address',
              city: areaObj.city?.trim() || dto.city?.trim() || 'City',
              state: areaObj.state?.trim() || dto.state?.trim() || undefined,
              pincode: areaObj.pincode?.trim() || '000000',
              isDefault: isFirst,
              serviceRadiusKm: areaObj.serviceRadiusKm ? Number(areaObj.serviceRadiusKm) : 10,
              latitude: areaObj.latitude ? Number(areaObj.latitude) : undefined,
              longitude: areaObj.longitude ? Number(areaObj.longitude) : undefined,
            });
            createdAreas.push(await areaRepo.save(area));
            isFirst = false;
          }
        }
      }

      return {
        user: savedUser,
        profile: savedProfile,
        bankAccount: newAccount,
        services: createdServices,
        serviceAreas: createdAreas,
      };
    });

    if (dto.email) {
      await this.emailService.sendPurohitCreatedByAdminEmail(
        dto.email,
        `${dto.firstName} ${dto.lastName || ''}`.trim(),
        result.user.username,
        dto.phone ?? 'N/A',
        dto.password,
      );
    }

    return {
      success: true,
      message: 'Purohit created successfully by admin',
      data: result,
    };
  }

  async createAstrologerByAdmin(
    dto: CreateAstrologerByAdminDto,
    files?: {
      profileImage?: Express.Multer.File[];
      aadhaarDoc?: Express.Multer.File[];
      panDoc?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
    },
  ) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        'At least email or phone number must be provided',
      );
    }

    if (dto.confirmPassword && dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    if (dto.phone) {
      const existingUserByPhone = await this.userRepository.findOne({
        where: { phone: dto.phone.trim() },
      });
      if (existingUserByPhone)
        throw new ConflictException('Phone number already in use');
    }
    if (dto.email) {
      const existingUserByEmail = await this.userRepository.findByEmail(
        dto.email.trim().toLowerCase(),
      );
      if (existingUserByEmail)
        throw new ConflictException('Email already in use');
    }

    const aadhaarFiles = (files as any)?.aadhaarDoc?.filter(
      (f: Express.Multer.File) => f && f.buffer && f.buffer.length > 0,
    );
    const panFiles = (files as any)?.panDoc?.filter(
      (f: Express.Multer.File) => f && f.buffer && f.buffer.length > 0,
    );
    const certificateFiles = (files as any)?.certificate?.filter(
      (f: Express.Multer.File) => f && f.buffer && f.buffer.length > 0,
    );
    const profileImageFile = (files as any)?.profileImage?.[0];

    let aadhaarDocUrl = (dto.aadhaarDocUrl ?? dto.aadhaarDoc)?.trim() || null;
    let panDocUrl = (dto.panDocUrl ?? dto.panDoc)?.trim() || null;
    let certificateUrl = (dto.certificateUrl ?? dto.certificate)?.trim() || null;

    let aadhaarNumber = dto.aadhaarNumber?.trim() || null;
    if (aadhaarNumber) {
      const cleanAadhaar = aadhaarNumber.replace(/[\s-]/g, '');
      if (!isValidAadhaar(cleanAadhaar)) {
        throw new BadRequestException(
          'aadhaarNumber must be a valid Aadhaar number',
        );
      }
      aadhaarNumber = cleanAadhaar;

      const existingAadhaar = await this.dataSource
        .getRepository(AstrologerProfile)
        .findOne({
          where: { aadhaarNumber },
        });
      if (existingAadhaar) {
        throw new ConflictException('Aadhaar number already in use');
      }
    }

    const bankData = (dto as any).bankAccount || ((dto as any).bankAccounts && (dto as any).bankAccounts[0]) || {};
    const accountHolderName = (dto.accountHolderName ?? bankData.accountHolderName)?.trim() || null;
    const accountNumber = (dto.accountNumber ?? bankData.accountNumber)?.trim() || null;
    const ifscCode = (dto.ifscCode ?? bankData.ifscCode)?.trim() || null;
    const bankName = (dto.bankName ?? bankData.bankName)?.trim() || null;
    const upiId = (dto.upiId ?? bankData.upiId)?.trim() || null;
    const paymentMethod = dto.paymentMethod ?? bankData.paymentMethod ?? (upiId ? PUROHIT_PAYMENT_METHOD.UPI : PUROHIT_PAYMENT_METHOD.BANK);

    if (accountNumber) {
      const existingAccount = await this.bankAccountRepository.findByAccountNumber(accountNumber);
      if (existingAccount) {
        throw new ConflictException('Bank account number already in use');
      }
    }

    const rawQualification = dto.qualification ?? dto.education;
    const parsedQual = parseStringArray(rawQualification) || (Array.isArray(rawQualification) ? rawQualification : (rawQualification ? [rawQualification] : null));

    const hasAadhaar = !!(aadhaarDocUrl || (aadhaarFiles && aadhaarFiles.length > 0));
    const hasPan = !!(panDocUrl || (panFiles && panFiles.length > 0));

    const completeness = this.checkProfileCompleteness({
      role: USER_ROLE.ASTROLOGER,
      user: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
      },
      profile: {
        city: dto.city,
        state: dto.state,
        bio: dto.bio,
        qualification: parsedQual,
        aadhaarDocUrl: hasAadhaar ? (aadhaarDocUrl || 'pending_file') : (aadhaarDocUrl || null),
        panDocUrl: hasPan ? (panDocUrl || 'pending_file') : (panDocUrl || null),
      },
      bankAccount: {
        accountNumber,
        ifscCode,
        accountHolderName,
        upiId,
      },
      serviceAreas: null, // Astrologers never require service area
    });
    const isComplete = completeness.isComplete;

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const astrologySetting = await this.platformSettingRepository.findOne({
      where: { key: PLATFORM_SETTING_KEY.ASTROLOGY_COMMISSION_PRICE },
    });
    const defaultCommissionPrice =
      astrologySetting?.value && !isNaN(Number(astrologySetting.value))
        ? Number(astrologySetting.value)
        : 50;

    const commissionPctSetting =
      (await this.platformSettingRepository.findOne({
        where: { key: PLATFORM_SETTING_KEY.ASTROLOGY_COMMISSION_PERCENTAGE },
      })) ||
      (await this.platformSettingRepository.findOne({
        where: { key: PLATFORM_SETTING_KEY.COMMISSION_PERCENTAGE },
      }));
    const defaultCommissionPercentage =
      commissionPctSetting?.value && !isNaN(Number(commissionPctSetting.value))
        ? Number(commissionPctSetting.value)
        : 10;

    const result = await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);

      const username =
        dto.username?.trim() ||
        (dto.firstName.replace(/\s+/g, '') + Math.floor(Math.random() * 1000));

      let userProfileImage = dto.profileImage?.trim() || undefined;

      const user = userRepository.create({
        username,
        email: dto.email?.trim().toLowerCase(),
        phone: dto.phone?.trim(),
        countryCode: dto.countryCode?.trim(),
        hashedPassword,
        role: USER_ROLE.ASTROLOGER,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        status: USER_STATUS.ACTIVE,
        isAdminCreated: !isComplete,
        dob: dto.dob ? new Date(dto.dob) : undefined,
        profileImage: userProfileImage,
      });

      const savedUser = await userRepository.save(user);

      if (profileImageFile && profileImageFile.buffer && profileImageFile.buffer.length > 0) {
        try {
          const imageUrl = await this.s3Service.uploadProfileImage(
            savedUser.id,
            profileImageFile,
          );
          savedUser.profileImage = imageUrl;
          await userRepository.save(savedUser);
        } catch (e) {
          this.logger.warn(`Failed to upload profileImage: ${e}`);
        }
      }

      if (aadhaarFiles?.length) {
        try {
          aadhaarDocUrl = (await this.s3Service.uploadFileHelper(
            savedUser.id,
            'aadhaarDoc',
            aadhaarFiles,
          )) || aadhaarDocUrl;
        } catch (e) {
          this.logger.warn(`Failed to upload aadhaarDoc: ${e}`);
        }
      }
      if (panFiles?.length) {
        try {
          panDocUrl = (await this.s3Service.uploadFileHelper(
            savedUser.id,
            'panDoc',
            panFiles,
          )) || panDocUrl;
        } catch (e) {
          this.logger.warn(`Failed to upload panDoc: ${e}`);
        }
      }
      if (certificateFiles?.length) {
        try {
          certificateUrl = (await this.s3Service.uploadFileHelper(
            savedUser.id,
            'certificate',
            certificateFiles,
          )) || certificateUrl;
        } catch (e) {
          this.logger.warn(`Failed to upload certificate: ${e}`);
        }
      }

      const ratePerMin =
        dto.ratePerMinute !== undefined && dto.ratePerMinute !== null && (dto.ratePerMinute as any) !== ''
          ? Number(dto.ratePerMinute)
          : null;

      const astrologyPrice =
        dto.astrologyPrice !== undefined && dto.astrologyPrice !== null && (dto.astrologyPrice as any) !== ''
          ? Number(dto.astrologyPrice)
          : null;

      let commissionPercentage: number | null = null;
      if (
        dto.commissionPercentage !== undefined &&
        dto.commissionPercentage !== null &&
        (dto.commissionPercentage as any) !== ''
      ) {
        commissionPercentage = Number(dto.commissionPercentage);
      } else if (astrologyPrice !== null) {
        commissionPercentage = defaultCommissionPercentage;
      }

      let commissionPrice: number | null = null;
      if (astrologyPrice !== null && commissionPercentage !== null) {
        commissionPrice = Number(
          ((astrologyPrice * commissionPercentage) / 100).toFixed(2),
        );
      } else if (
        dto.commissionPrice !== undefined &&
        dto.commissionPrice !== null &&
        (dto.commissionPrice as any) !== ''
      ) {
        commissionPrice = Number(dto.commissionPrice);
      }

      let astrologerPayout: number | null = null;
      if (astrologyPrice !== null && commissionPrice !== null) {
        astrologerPayout = Number((astrologyPrice - commissionPrice).toFixed(2));
      } else if (astrologyPrice !== null) {
        astrologerPayout = Number(astrologyPrice.toFixed(2));
      } else if (
        dto.astrologerPayout !== undefined &&
        dto.astrologerPayout !== null &&
        (dto.astrologerPayout as any) !== ''
      ) {
        astrologerPayout = Number(dto.astrologerPayout);
      }

      // Validate pricing if supplied
      if (
        dto.commissionPrice !== undefined &&
        dto.commissionPrice !== null &&
        (dto.commissionPrice as any) !== '' &&
        astrologyPrice !== null &&
        commissionPercentage !== null
      ) {
        const expected = Number(((astrologyPrice * commissionPercentage) / 100).toFixed(2));
        if (Math.abs(Number(dto.commissionPrice) - expected) > 0.01) {
          throw new BadRequestException(
            `commissionPrice (${dto.commissionPrice}) must match calculated commission price: ${expected}`,
          );
        }
      }

      if (
        dto.astrologerPayout !== undefined &&
        dto.astrologerPayout !== null &&
        (dto.astrologerPayout as any) !== '' &&
        astrologyPrice !== null &&
        commissionPrice !== null
      ) {
        const expectedPayout = Number((astrologyPrice - commissionPrice).toFixed(2));
        if (Math.abs(Number(dto.astrologerPayout) - expectedPayout) > 0.01) {
          throw new BadRequestException(
            `astrologerPayout (${dto.astrologerPayout}) must match calculated payout: ${expectedPayout}`,
          );
        }
      }

      const profile = manager.create(AstrologerProfile, {
        userId: savedUser.id,
        bio: dto.bio?.trim(),
        qualification: parsedQual || undefined,
        experienceYears: dto.experienceYears,
        languages: dto.languages,
        specializations: dto.specializations,
        specification: dto.specification?.trim(),
        city: dto.city?.trim(),
        state: dto.state?.trim(),
        ratePerMinute: ratePerMin,
        astrologyPrice,
        commissionPercentage,
        commissionPrice,
        astrologerPayout,
        aadhaarNumber: aadhaarNumber || undefined,
        aadhaarDocUrl: aadhaarDocUrl || undefined,
        panDocUrl: panDocUrl || undefined,
        certificateUrl: certificateUrl || undefined,
        verificationStatus: isComplete
          ? PUROHIT_VERIFICATION_STATUS.APPROVED
          : PUROHIT_VERIFICATION_STATUS.PENDING,
        rejectionReason: null as any,
      });
      const savedProfile = await manager.save(profile);

      const hasAnyBankData = Boolean(
        accountNumber ||
        upiId ||
        accountHolderName ||
        ifscCode ||
        bankName
      );

      let newAccount: BankAccount | null = null;
      if (hasAnyBankData) {
        const bankRepo = manager.getRepository(BankAccount);
        newAccount = bankRepo.create({
          userId: savedUser.id,
          accountHolderName: accountHolderName || '',
          accountNumber: accountNumber || '',
          ifscCode: ifscCode || '',
          bankName: bankName || '',
          accountType: (dto as any).accountType || undefined,
          paymentMethod,
          upiId: upiId || null,
          isPrimary: true,
          verificationStatus: isComplete
            ? BANK_VERIFICATION_STATUS.VERIFIED
            : BANK_VERIFICATION_STATUS.PENDING,
        });
        await bankRepo.save(newAccount);
      }

      return {
        user: savedUser,
        profile: savedProfile,
        bankAccount: newAccount,
      };
    });

    if (dto.email) {
      await this.emailService.sendAstrologerCreatedByAdminEmail(
        dto.email,
        `${dto.firstName} ${dto.lastName || ''}`.trim(),
        result.user.username,
        dto.phone ?? 'N/A',
        dto.password,
      );
    }
    (result as any).message = 'Astrologer created successfully by admin';
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
    if (!dto.email && !dto.phone && !dto.id) {
      throw new BadRequestException(
        'At least email, phone number, or id must be provided',
      );
    }

    const regStartTime = performance.now();
    const passwordHashPromise =
      !dto.id && dto.password
        ? bcrypt.hash(dto.password, 10)
        : Promise.resolve('');

    // 1. Verify OTP record
    // const otpWhere: any[] = [];

    let otpRecord: any;
    let existingAdminCreatedUser: User | null = null;

    if (dto.id) {
      existingAdminCreatedUser = await this.userRepository.findOne({
        where: { id: dto.id },
      });
      if (!existingAdminCreatedUser) {
        throw new NotFoundException('Purohit not found');
      }
      if (existingAdminCreatedUser.role !== USER_ROLE.PUROHIT) {
        throw new BadRequestException('User is not a purohit');
      }
      otpRecord = { role: USER_ROLE.PUROHIT }; // Mock for the rest of the flow
    } else {
      const otpConditions: any[] = [];
      if (dto.email) {
        otpConditions.push({
          email: dto.email.trim().toLowerCase(),
          isVerified: true,
        });
      }
      if (dto.phone) {
        otpConditions.push({
          phone: dto.phone.trim(),
          isVerified: true,
        });
      }

      otpRecord = await this.otpRepository.findOne({
        where: otpConditions.length > 1 ? otpConditions : otpConditions[0],
        order: { id: 'DESC' },
      });

      if (!otpRecord) {
        throw new BadRequestException('Please verify your OTP first');
      }

      if (otpRecord.expiresAt < new Date()) {
        throw new BadRequestException('OTP has expired');
      }
    }

    const effectiveRole = otpRecord?.role || USER_ROLE.CUSTOMER;

    if (effectiveRole === USER_ROLE.CUSTOMER) {
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

    if (effectiveRole === USER_ROLE.PUROHIT) {
      const requiredFields = [
        'bio',
        'qualification',
        'experienceYears',
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

      if (dto.aadhaarNumber && typeof dto.aadhaarNumber === 'string' && dto.aadhaarNumber.trim() !== '') {
        const cleanAadhaar = dto.aadhaarNumber.replace(/[\s-]/g, '');
        if (!isValidAadhaar(cleanAadhaar)) {
          throw new BadRequestException(
            'aadhaarNumber must be a valid Aadhaar number',
          );
        }
        dto.aadhaarNumber = cleanAadhaar;
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

      const hasProfileImage = files.profileImage?.length || dto.profileImage;
      if (!hasProfileImage) {
        throw new BadRequestException(
          'Profile image is required for Purohit registration',
        );
      }

      // const hasAadhaar = files.aadhaarDoc?.length || dto.aadhaarDoc;
      // const hasPan = files.panDoc?.length || dto.panDoc;

      // if (!hasAadhaar && !hasPan) {
      //   throw new BadRequestException(
      //     'Either Aadhaar or PAN document is required',
      //   );
      // }

      // if (!files.certificate?.length && !dto.certificate) {
      //   throw new BadRequestException('Certificate or URL is required');
      // }

      // if (
      //   !files.templeAffiliationProof?.length &&
      //   !dto.templeAffiliationProof
      // ) {
      //   throw new BadRequestException(
      //     'Temple affiliation proof or URL is required',
      //   );
      // }
    }

    if (effectiveRole === USER_ROLE.ASTROLOGER) {
      if (dto.aadhaarNumber && typeof dto.aadhaarNumber === 'string' && dto.aadhaarNumber.trim() !== '') {
        const cleanAadhaar = dto.aadhaarNumber.replace(/[\s-]/g, '');
        if (!isValidAadhaar(cleanAadhaar)) {
          throw new BadRequestException(
            'aadhaarNumber must be a valid Aadhaar number',
          );
        }
        dto.aadhaarNumber = cleanAadhaar;
      }
    }

    if (!dto.id || ((effectiveRole === USER_ROLE.PUROHIT || effectiveRole === USER_ROLE.ASTROLOGER) && (dto.aadhaarNumber || dto.accountNumber))) {
      const [
        existingUserByEmail,
        existingUserByPhone,
        existingUsername,
        existingAadhaar,
        existingAstrologerAadhaar,
        existingAccount,
      ] = await Promise.all([
        !dto.id && dto.email
          ? this.userRepository.findByEmail(dto.email)
          : Promise.resolve(null),
        !dto.id && dto.phone
          ? this.userRepository.findOne({ where: { phone: dto.phone.trim() } })
          : Promise.resolve(null),
        !dto.id && dto.username
          ? this.userRepository.findOne({ where: { username: dto.username.trim() } })
          : Promise.resolve(null),
        effectiveRole === USER_ROLE.PUROHIT && dto.aadhaarNumber
          ? this.purohitProfileRepository.findOne({
            where: { aadhaarNumber: dto.aadhaarNumber.trim() },
          })
          : Promise.resolve(null),
        effectiveRole === USER_ROLE.ASTROLOGER && dto.aadhaarNumber
          ? this.dataSource.getRepository(AstrologerProfile).findOne({
            where: { aadhaarNumber: dto.aadhaarNumber.trim() },
          })
          : Promise.resolve(null),
        (effectiveRole === USER_ROLE.PUROHIT || effectiveRole === USER_ROLE.ASTROLOGER) && dto.accountNumber
          ? this.dataSource
            .getRepository(BankAccount)
            .findOne({ where: { accountNumber: dto.accountNumber.trim() } })
          : Promise.resolve(null),
      ]);

      if (!dto.id) {
        if (existingUserByEmail) {
          throw new ConflictException('Email already in use');
        }
        if (existingUserByPhone) {
          throw new ConflictException('Phone number already in use');
        }
        if (existingUsername) {
          throw new ConflictException('Username already in use');
        }
      }

      if (existingAadhaar || existingAstrologerAadhaar) {
        throw new ConflictException('Aadhaar number already in use');
      }

      if (existingAccount) {
        throw new ConflictException('Bank account number already in use');
      }
    }

    // Track S3 URLs uploaded during this registration so we can clean them up
    // if the database transaction fails (prevents orphaned S3 objects).
    const uploadedS3Urls: string[] = [];

    // Run database writes inside a transaction
    let savedUser: User;
    let savedCustomerAddress: CustomerAddress | null = null;
    let savedPurohitServiceArea: PurohitServiceArea | null = null;
    let savedAstrologerProfile: AstrologerProfile | null = null;

    try {
      ({ saved: savedUser, savedCustomerAddress, savedPurohitServiceArea, savedAstrologerProfile } =
        await this.dataSource.transaction(async (manager) => {
          let saved: User;

          if (dto.id) {
            saved = existingAdminCreatedUser!;
            saved.isAdminCreated = false;
            await manager.save(User, saved);
          } else {
            // 5. Await pre-computed password hash
            const hashedPassword = await passwordHashPromise;

            const username =
              dto.username ??
              `user${Date.now()}${Math.floor(Math.random() * 1000)}`;

            const newUser = manager.create(User, {
              dob: dto.dob,
              birthPlace: dto.birthPlace,
              rashi: dto.rashi,
              gotra: dto.gotra,
              ...(dto.email && { email: dto.email.toLowerCase() }),
              username,
              ...(dto.phone && { phone: dto.phone }),
              ...(dto.countryCode && { countryCode: dto.countryCode }),
              firstName: dto.firstName,
              lastName: dto.lastName,
              hashedPassword: hashedPassword,
              role: effectiveRole,
              // TODO: PUROHIT_VERIFICATION_REWORK
              // User account status is ACTIVE upon registration; Purohit verification status is PENDING.
              status: USER_STATUS.ACTIVE,
            });

            saved = await manager.save(User, newUser);
          }

          // Use Promise.allSettled so that every individual upload that succeeds
          // is tracked immediately, even when one or more sibling uploads fail.
          // Promise.all would short-circuit on the first rejection and leave the
          // already-resolved uploads untracked (and therefore orphaned on cleanup).
          const uploadResults = await Promise.allSettled([
            files.aadhaarDoc?.length
              ? this.s3Service.uploadFileHelper(
                saved.id,
                'aadhaarDoc',
                files.aadhaarDoc,
              )
              : Promise.resolve(dto.aadhaarDoc),
            files.panDoc?.length
              ? this.s3Service.uploadFileHelper(
                saved.id,
                'panDoc',
                files.panDoc,
              )
              : Promise.resolve(dto.panDoc),
            files.certificate?.length
              ? this.s3Service.uploadFileHelper(
                saved.id,
                'certificate',
                files.certificate,
              )
              : Promise.resolve(dto.certificate),
            files.templeAffiliationProof?.length
              ? this.s3Service.uploadFileHelper(
                saved.id,
                'templeAffiliationProof',
                files.templeAffiliationProof,
              )
              : Promise.resolve(dto.templeAffiliationProof),
            files.profileImage?.length
              ? this.s3Service.uploadFileHelper(
                saved.id,
                'profileImage',
                files.profileImage,
              )
              : Promise.resolve(dto.profileImage),
          ]);

          // Destructure in the same positional order as the upload array above.
          const [
            aadhaarResult,
            panResult,
            certificateResult,
            templeResult,
            profileImageResult,
          ] = uploadResults;

          // Track every URL that was freshly uploaded from a file (not a pre-existing DTO string).
          // We check the file guard so that DTO pass-through strings are never treated as uploads.
          if (files.aadhaarDoc?.length && aadhaarResult.status === 'fulfilled' && aadhaarResult.value)
            uploadedS3Urls.push(aadhaarResult.value);
          if (files.panDoc?.length && panResult.status === 'fulfilled' && panResult.value)
            uploadedS3Urls.push(panResult.value);
          if (files.certificate?.length && certificateResult.status === 'fulfilled' && certificateResult.value)
            uploadedS3Urls.push(certificateResult.value);
          if (files.templeAffiliationProof?.length && templeResult.status === 'fulfilled' && templeResult.value)
            uploadedS3Urls.push(templeResult.value);
          if (files.profileImage?.length && profileImageResult.status === 'fulfilled' && profileImageResult.value)
            uploadedS3Urls.push(profileImageResult.value);

          // If any upload failed, find the first rejection and rethrow it.
          // The outer try/catch will then trigger S3 cleanup for everything tracked above.
          const firstFailure = uploadResults.find((r): r is PromiseRejectedResult => r.status === 'rejected');
          if (firstFailure) {
            throw firstFailure.reason instanceof Error
              ? firstFailure.reason
              : new Error(String(firstFailure.reason));
          }

          // All uploads succeeded — extract resolved values for use below.
          const aadhaarDocUrl = (aadhaarResult as PromiseFulfilledResult<string | undefined>).value;
          const panDocUrl = (panResult as PromiseFulfilledResult<string | undefined>).value;
          const certificateUrl = (certificateResult as PromiseFulfilledResult<string | undefined>).value;
          const templeAffiliationProofUrl = (templeResult as PromiseFulfilledResult<string | undefined>).value;
          const profileImageUrl = (profileImageResult as PromiseFulfilledResult<string | undefined>).value;


          if (profileImageUrl) {
            await manager.update(User, saved.id, { profileImage: profileImageUrl });
            saved.profileImage = profileImageUrl;
          }

          if (effectiveRole === USER_ROLE.PUROHIT) {
            // const missingDocs: string[] = [];
            // if (!aadhaarDocUrl && !panDocUrl)
            //   missingDocs.push('Aadhaar or PAN document');
            // if (!certificateUrl) missingDocs.push('Certificate');
            // if (!templeAffiliationProofUrl)
            //   missingDocs.push('Temple affiliation proof');

            // if (missingDocs.length > 0) {
            //   throw new BadRequestException(
            //     `Please provide all required images. Missing: ${missingDocs.join(', ')}`,
            //   );
            // }

            const isOnlineAvailable = dto.isOnlineAvailable === 'true';

            const isOfflineAvailable = dto.isOfflineAvailable === 'true';

            let profile = await manager.findOne(PurohitProfile, {
              where: { userId: saved.id },
            });

            if (profile) {
              Object.assign(profile, {
                bio: dto.bio ?? profile.bio,
                qualification: dto.qualification ?? profile.qualification,
                experienceYears: dto.experienceYears ?? profile.experienceYears,
                aadhaarNumber: dto.aadhaarNumber ?? profile.aadhaarNumber,
                aadhaarDocUrl: aadhaarDocUrl || profile.aadhaarDocUrl,
                panDocUrl: panDocUrl || profile.panDocUrl,
                certificateUrl: certificateUrl || profile.certificateUrl,
                templeAffiliationProofUrl:
                  templeAffiliationProofUrl || profile.templeAffiliationProofUrl,
                city: dto.city ?? profile.city,
                state: dto.state ?? profile.state,
                languages: dto.languages ?? profile.languages,
                specializations: dto.specializations ?? profile.specializations,
                isOnlineAvailable:
                  dto.isOnlineAvailable !== undefined
                    ? isOnlineAvailable
                    : profile.isOnlineAvailable,
                isOfflineAvailable:
                  dto.isOfflineAvailable !== undefined
                    ? isOfflineAvailable
                    : profile.isOfflineAvailable,
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
                state: dto.state,
                languages: dto.languages,
                specializations: dto.specializations,
                isOnlineAvailable,
                isOfflineAvailable,
              });
              await manager.save(profile);
            }

            const bankAccountData: any = {
              userId: saved.id,
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

            await manager.save(manager.create(BankAccount, bankAccountData));

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
          } else if (effectiveRole === USER_ROLE.ASTROLOGER) {
            let astrologerProfile = await manager.findOne(AstrologerProfile, {
              where: { userId: saved.id },
            });

            const ratePerMin =
              dto.ratePerMinute !== undefined && dto.ratePerMinute !== null && (dto.ratePerMinute as any) !== ''
                ? Number(dto.ratePerMinute)
                : null;

            const rawAstrologyPrice =
              dto.astrologyPrice !== undefined
                ? dto.astrologyPrice
                : (dto as any).profile?.astrologyPrice;

            const astrologyPrice =
              rawAstrologyPrice !== undefined && rawAstrologyPrice !== null && (rawAstrologyPrice as any) !== ''
                ? Number(rawAstrologyPrice)
                : null;

            const commissionPctSetting =
              (await this.platformSettingRepository.findOne({
                where: { key: PLATFORM_SETTING_KEY.ASTROLOGY_COMMISSION_PERCENTAGE },
              })) ||
              (await this.platformSettingRepository.findOne({
                where: { key: PLATFORM_SETTING_KEY.COMMISSION_PERCENTAGE },
              }));
            const defaultCommissionPercentage =
              commissionPctSetting?.value && !isNaN(Number(commissionPctSetting.value))
                ? Number(commissionPctSetting.value)
                : 10;

            const rawCommissionPct =
              dto.commissionPercentage !== undefined
                ? dto.commissionPercentage
                : (dto as any).profile?.commissionPercentage;

            let commissionPercentage: number | null = null;
            if (
              rawCommissionPct !== undefined &&
              rawCommissionPct !== null &&
              (rawCommissionPct as any) !== ''
            ) {
              commissionPercentage = Number(rawCommissionPct);
            } else if (astrologyPrice !== null) {
              commissionPercentage = defaultCommissionPercentage;
            }

            const rawCommissionPrice =
              dto.commissionPrice !== undefined
                ? dto.commissionPrice
                : (dto as any).profile?.commissionPrice;

            let commissionPrice: number | null = null;
            if (astrologyPrice !== null && commissionPercentage !== null) {
              commissionPrice = Number(
                ((astrologyPrice * commissionPercentage) / 100).toFixed(2),
              );
            } else if (
              rawCommissionPrice !== undefined &&
              rawCommissionPrice !== null &&
              (rawCommissionPrice as any) !== ''
            ) {
              commissionPrice = Number(rawCommissionPrice);
            }

            const rawAstrologerPayout =
              (dto as any).astrologerPayout !== undefined
                ? (dto as any).astrologerPayout
                : (dto as any).profile?.astrologerPayout;

            let astrologerPayout: number | null = null;
            if (astrologyPrice !== null && commissionPrice !== null) {
              astrologerPayout = Number((astrologyPrice - commissionPrice).toFixed(2));
            } else if (astrologyPrice !== null) {
              astrologerPayout = Number(astrologyPrice.toFixed(2));
            } else if (
              rawAstrologerPayout !== undefined &&
              rawAstrologerPayout !== null &&
              (rawAstrologerPayout as any) !== ''
            ) {
              astrologerPayout = Number(rawAstrologerPayout);
            }

            if (
              rawCommissionPrice !== undefined &&
              rawCommissionPrice !== null &&
              (rawCommissionPrice as any) !== '' &&
              astrologyPrice !== null &&
              commissionPercentage !== null
            ) {
              const expected = Number(((astrologyPrice * commissionPercentage) / 100).toFixed(2));
              if (Math.abs(Number(rawCommissionPrice) - expected) > 0.01) {
                throw new BadRequestException(
                  `commissionPrice (${rawCommissionPrice}) must match calculated commission price: ${expected}`,
                );
              }
            }

            if (
              rawAstrologerPayout !== undefined &&
              rawAstrologerPayout !== null &&
              (rawAstrologerPayout as any) !== '' &&
              astrologyPrice !== null &&
              commissionPrice !== null
            ) {
              const expectedPayout = Number((astrologyPrice - commissionPrice).toFixed(2));
              if (Math.abs(Number(rawAstrologerPayout) - expectedPayout) > 0.01) {
                throw new BadRequestException(
                  `astrologerPayout (${rawAstrologerPayout}) must match calculated payout: ${expectedPayout}`,
                );
              }
            }

            if (astrologerProfile) {
              Object.assign(astrologerProfile, {
                bio: dto.bio ?? astrologerProfile.bio,
                qualification: dto.qualification ?? astrologerProfile.qualification,
                experienceYears: dto.experienceYears ?? astrologerProfile.experienceYears,
                aadhaarNumber: dto.aadhaarNumber ?? astrologerProfile.aadhaarNumber,
                aadhaarDocUrl: aadhaarDocUrl || astrologerProfile.aadhaarDocUrl,
                panDocUrl: panDocUrl || astrologerProfile.panDocUrl,
                certificateUrl: certificateUrl || astrologerProfile.certificateUrl,
                city: dto.city ?? astrologerProfile.city,
                state: dto.state ?? astrologerProfile.state,
                languages: dto.languages ?? astrologerProfile.languages,
                specializations: dto.specializations ?? astrologerProfile.specializations,
                specification: dto.specification ?? astrologerProfile.specification,
                ratePerMinute: ratePerMin !== null ? ratePerMin : astrologerProfile.ratePerMinute,
                astrologyPrice: astrologyPrice !== null ? astrologyPrice : astrologerProfile.astrologyPrice,
                commissionPercentage: commissionPercentage !== null ? commissionPercentage : astrologerProfile.commissionPercentage,
                commissionPrice: commissionPrice !== null ? commissionPrice : astrologerProfile.commissionPrice,
                astrologerPayout: astrologerPayout !== null ? astrologerPayout : astrologerProfile.astrologerPayout,
              });
              savedAstrologerProfile = await manager.save(astrologerProfile);
            } else {
              astrologerProfile = manager.create(AstrologerProfile, {
                userId: saved.id,
                bio: dto.bio,
                qualification: dto.qualification,
                experienceYears: dto.experienceYears,
                aadhaarNumber: dto.aadhaarNumber,
                aadhaarDocUrl,
                panDocUrl,
                certificateUrl,
                city: dto.city,
                state: dto.state,
                languages: dto.languages,
                specializations: dto.specializations,
                specification: dto.specification,
                ratePerMinute: ratePerMin,
                astrologyPrice,
                commissionPercentage,
                commissionPrice,
                astrologerPayout,
                verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
              });
              savedAstrologerProfile = await manager.save(astrologerProfile);
            }

            const bankData = (dto as any).bankAccount || ((dto as any).bankAccounts && (dto as any).bankAccounts[0]) || {};
            const accountHolderName = dto.accountHolderName ?? bankData.accountHolderName;
            const accountNumber = dto.accountNumber ?? bankData.accountNumber;
            const ifscCode = dto.ifscCode ?? bankData.ifscCode;
            const bankName = dto.bankName ?? bankData.bankName;
            const paymentMethod = dto.paymentMethod ?? bankData.paymentMethod;
            const upiId = dto.upiId ?? bankData.upiId;

            if (accountNumber || upiId) {
              const astrologerBankData: any = {
                userId: saved.id,
                paymentMethod: paymentMethod || (upiId ? PUROHIT_PAYMENT_METHOD.UPI : PUROHIT_PAYMENT_METHOD.BANK),
                isPrimary: true,
                verificationStatus: BANK_VERIFICATION_STATUS.PENDING,
              };

              if (accountNumber) {
                astrologerBankData.accountHolderName = accountHolderName;
                astrologerBankData.accountNumber = accountNumber;
                astrologerBankData.ifscCode = ifscCode;
                astrologerBankData.bankName = bankName;
                astrologerBankData.accountType = (dto as any).accountType ?? bankData.accountType;
              }
              if (upiId) {
                astrologerBankData.upiId = upiId;
              }

              const savedAccount = await manager.save(manager.create(BankAccount, astrologerBankData));
              if (this.hasValidPayoutMethod(savedAccount) && saved.isAdminCreated) {
                saved.isAdminCreated = false;
                await manager.update(User, saved.id, { isAdminCreated: false });
              }
            }
          }

          let savedCustomerAddress: CustomerAddress | null = null;
          if (saved.role === USER_ROLE.CUSTOMER) {
            let addressData = dto.address;
            if (typeof addressData === 'string') {
              try {
                addressData = JSON.parse(addressData);
              } catch {
                // ignore json parse error
              }
            }

            const fullAddress =
              dto.fullAddress ||
              (typeof addressData === 'object' && addressData !== null
                ? addressData.fullAddress
                : undefined);

            if (
              fullAddress &&
              typeof fullAddress === 'string' &&
              fullAddress.trim() !== ''
            ) {
              const addressLabel =
                dto.addressLabel ||
                (typeof addressData === 'object' && addressData !== null
                  ? addressData.addressLabel
                  : undefined) ||
                'HOME';

              let city =
                (typeof addressData === 'object' && addressData !== null
                  ? addressData.city
                  : undefined) ||
                dto.city ||
                '';

              let pincode =
                dto.pincode ||
                (typeof addressData === 'object' && addressData !== null
                  ? addressData.pincode
                  : undefined) ||
                '';

              if (!pincode || pincode.trim() === '') {
                const pinMatch = fullAddress.match(/\b\d{6}\b/);
                if (pinMatch) pincode = pinMatch[0];
                else pincode = '000000';
              }

              if (!city || city.trim() === '') {
                city = 'N/A';
              }

              const state =
                dto.state ||
                (typeof addressData === 'object' && addressData !== null
                  ? addressData.state
                  : undefined) ||
                undefined;

              const venueType =
                dto.venueType ||
                (typeof addressData === 'object' && addressData !== null
                  ? addressData.venueType
                  : undefined) ||
                VENUE_TYPE.HOME;

              const latitude =
                dto.latitude !== undefined
                  ? dto.latitude
                  : typeof addressData === 'object' &&
                    addressData !== null &&
                    addressData.latitude !== undefined
                    ? Number(addressData.latitude)
                    : undefined;

              const longitude =
                dto.longitude !== undefined
                  ? dto.longitude
                  : typeof addressData === 'object' &&
                    addressData !== null &&
                    addressData.longitude !== undefined
                    ? Number(addressData.longitude)
                    : undefined;

              const isDefault =
                dto.isDefault !== undefined
                  ? dto.isDefault
                  : typeof addressData === 'object' &&
                    addressData !== null &&
                    addressData.isDefault !== undefined
                    ? addressData.isDefault === true || addressData.isDefault === 'true'
                    : true;

              if (isDefault) {
                // Clear any existing default address for this customer just in case
                await manager.update(
                  CustomerAddress,
                  { customerId: saved.id, isDefault: true },
                  { isDefault: false },
                );
              }

              const newAddress = manager.create(CustomerAddress, {
                customerId: saved.id,
                addressLabel: addressLabel.trim(),
                fullAddress: fullAddress.trim(),
                city: city.trim(),
                state: state ? state.trim() : undefined,
                pincode: pincode.trim(),
                venueType,
                latitude,
                longitude,
                isDefault,
              });

              savedCustomerAddress = await manager.save(
                CustomerAddress,
                newAddress,
              );

              await this.auditLogService.createAuditLog(
                {
                  actorId: saved.id,
                  actorType: ACTOR_TYPE.USER,
                  actorRole: saved.role,
                  module: AUDIT_MODULE.USER,
                  entity: 'CustomerAddress',
                  entityId: String(savedCustomerAddress.id),
                  action: 'CUSTOMER_ADDRESS_CREATED',
                  message: `Customer #${saved.id} registered with ${isDefault ? 'default ' : ''}address #${savedCustomerAddress.id}.`,
                  newValue: {
                    addressId: savedCustomerAddress.id,
                    fullAddress: savedCustomerAddress.fullAddress,
                    isDefault,
                  },
                },
                manager,
              );
            }
          }

          let savedPurohitServiceArea: PurohitServiceArea | null = null;
          if (saved.role === USER_ROLE.PUROHIT) {
            let serviceAreaData = dto.serviceArea;
            if (typeof serviceAreaData === 'string') {
              try {
                serviceAreaData = JSON.parse(serviceAreaData);
              } catch {
                // ignore json parse error
              }
            }

            const fullAddress =
              dto.fullAddress ||
              (typeof serviceAreaData === 'object' && serviceAreaData !== null
                ? serviceAreaData.fullAddress
                : undefined);

            if (
              fullAddress &&
              typeof fullAddress === 'string' &&
              fullAddress.trim() !== ''
            ) {
              const addressLabel =
                dto.addressLabel ||
                (typeof serviceAreaData === 'object' && serviceAreaData !== null
                  ? serviceAreaData.addressLabel
                  : undefined) ||
                'PRIMARY';

              const streetName =
                dto.streetName ||
                (typeof serviceAreaData === 'object' && serviceAreaData !== null
                  ? serviceAreaData.streetName
                  : undefined) ||
                fullAddress.split(',')[0].trim() ||
                'Main Street';

              let city =
                (typeof serviceAreaData === 'object' && serviceAreaData !== null
                  ? serviceAreaData.city
                  : undefined) ||
                dto.city ||
                '';

              let pincode =
                dto.pincode ||
                (typeof serviceAreaData === 'object' && serviceAreaData !== null
                  ? serviceAreaData.pincode
                  : undefined) ||
                '';

              if (!pincode || pincode.trim() === '') {
                const pinMatch = fullAddress.match(/\b\d{6}\b/);
                if (pinMatch) pincode = pinMatch[0];
                else pincode = '000000';
              }

              if (!city || city.trim() === '') {
                city = 'N/A';
              }

              const state =
                dto.state ||
                (typeof serviceAreaData === 'object' && serviceAreaData !== null
                  ? serviceAreaData.state
                  : undefined) ||
                undefined;

              const latitude =
                dto.latitude !== undefined
                  ? dto.latitude
                  : typeof serviceAreaData === 'object' &&
                    serviceAreaData !== null &&
                    serviceAreaData.latitude !== undefined
                    ? Number(serviceAreaData.latitude)
                    : undefined;

              const longitude =
                dto.longitude !== undefined
                  ? dto.longitude
                  : typeof serviceAreaData === 'object' &&
                    serviceAreaData !== null &&
                    serviceAreaData.longitude !== undefined
                    ? Number(serviceAreaData.longitude)
                    : undefined;

              const serviceRadiusKm =
                dto.serviceRadiusKm !== undefined
                  ? Number(dto.serviceRadiusKm)
                  : typeof serviceAreaData === 'object' &&
                    serviceAreaData !== null &&
                    serviceAreaData.serviceRadiusKm !== undefined
                    ? Number(serviceAreaData.serviceRadiusKm)
                    : 10;

              const isDefault =
                dto.isDefault !== undefined
                  ? dto.isDefault
                  : typeof serviceAreaData === 'object' &&
                    serviceAreaData !== null &&
                    serviceAreaData.isDefault !== undefined
                    ? serviceAreaData.isDefault === true || serviceAreaData.isDefault === 'true'
                    : true;

              if (isDefault) {
                await manager.update(
                  PurohitServiceArea,
                  { purohitId: saved.id, isDefault: true },
                  { isDefault: false },
                );
              }

              const newServiceArea = manager.create(PurohitServiceArea, {
                purohitId: saved.id,
                addressLabel: addressLabel.trim(),
                streetName: streetName.trim(),
                fullAddress: fullAddress.trim(),
                city: city.trim(),
                state: state ? state.trim() : undefined,
                pincode: pincode.trim(),
                latitude,
                longitude,
                serviceRadiusKm:
                  Number.isFinite(serviceRadiusKm) && serviceRadiusKm > 0
                    ? serviceRadiusKm
                    : 10,
                isDefault,
              });

              savedPurohitServiceArea = await manager.save(
                PurohitServiceArea,
                newServiceArea,
              );

              await this.auditLogService.createAuditLog(
                {
                  actorId: saved.id,
                  actorType: ACTOR_TYPE.USER,
                  actorRole: saved.role,
                  module: AUDIT_MODULE.USER,
                  entity: 'PurohitServiceArea',
                  entityId: String(savedPurohitServiceArea.id),
                  action: 'PUROHIT_SERVICE_AREA_CREATED',
                  message: `Purohit #${saved.id} registered with ${isDefault ? 'default ' : ''}service area #${savedPurohitServiceArea.id}.`,
                  newValue: {
                    serviceAreaId: savedPurohitServiceArea.id,
                    fullAddress: savedPurohitServiceArea.fullAddress,
                    city: savedPurohitServiceArea.city,
                    pincode: savedPurohitServiceArea.pincode,
                    serviceRadiusKm: savedPurohitServiceArea.serviceRadiusKm,
                    isDefault,
                  },
                },
                manager,
              );
            }
          }

          // 6. Delete OTP record after verification (skip if bypassed via purohitId)
          if (otpRecord.id) {
            await manager.delete(Otp, { id: otpRecord.id });
          }

          await this.auditLogService.createAuditLog(
            {
              actorId: saved.id,
              actorType: ACTOR_TYPE.USER,
              actorRole: saved.role,
              module: AUDIT_MODULE.USER,
              entity: 'User',
              entityId: String(saved.id),
              action: 'USER_REGISTERED',
              message: `User ${saved.username || saved.email || saved.phone} registered as ${saved.role}.`,
              oldValue: undefined,
              newValue: {
                role: saved.role,
                email: saved.email,
                phone: saved.phone,
              },
            },
            manager,
          );

          return { saved, savedCustomerAddress, savedPurohitServiceArea, savedAstrologerProfile };
        }));
    } catch (transactionError) {
      // DB transaction failed — clean up any S3 files uploaded during this attempt
      // to prevent orphaned objects. Runs best-effort; errors are logged but not rethrown.
      if (uploadedS3Urls.length > 0) {
        this.logger.warn(
          `[UserRegistration] Transaction failed. Cleaning up ${uploadedS3Urls.length} uploaded S3 file(s)…`,
        );
        await Promise.allSettled(
          uploadedS3Urls.map((url) => this.s3Service.deleteByUrl(url)),
        );
        this.logger.warn(
          `[UserRegistration] S3 cleanup complete for failed registration attempt.`,
        );
      }
      throw transactionError;
    }

    // 7. Send Registration Email to Customer or Purohit asynchronously post-commit
    if (savedUser.email) {
      const fullName = savedUser.firstName
        ? `${savedUser.firstName} ${savedUser.lastName || ''}`.trim()
        : savedUser.role === USER_ROLE.PUROHIT
          ? 'Purohit'
          : savedUser.role === USER_ROLE.ASTROLOGER
            ? 'Astrologer'
            : 'Devotee';
      const emailPayload = {
        email: savedUser.email,
        name: fullName,
        username: savedUser.username,
        phone: savedUser.phone,
      };
      const isPurohit = savedUser.role === USER_ROLE.PUROHIT;
      const isAstrologer = savedUser.role === USER_ROLE.ASTROLOGER;

      setImmediate(async () => {
        try {
          if (isPurohit) {
            this.logger.log(
              `[UserRegistration] Sending registration email to Purohit ${emailPayload.email}...`,
            );
            await this.emailService.sendPurohitRegistrationEmail(emailPayload);
            this.logger.log(
              `[UserRegistration] Purohit registration email sent successfully to ${emailPayload.email}.`,
            );
          } else if (isAstrologer) {
            this.logger.log(
              `[UserRegistration] Sending registration email to Astrologer ${emailPayload.email}...`,
            );
            await this.emailService.sendAstrologerRegistrationEmail(emailPayload);
            this.logger.log(
              `[UserRegistration] Astrologer registration email sent successfully to ${emailPayload.email}.`,
            );
          } else {
            this.logger.log(
              `[UserRegistration] Sending welcome registration email to customer ${emailPayload.email}...`,
            );
            await this.emailService.sendCustomerRegistrationEmail(emailPayload);
            this.logger.log(
              `[UserRegistration] Customer registration email sent successfully to ${emailPayload.email}.`,
            );
          }
        } catch (emailErr) {
          this.logger.error(
            `[UserRegistration] Failed to send registration email to ${emailPayload.email}`,
            emailErr instanceof Error ? emailErr.stack : String(emailErr),
          );
        }
      });
    }

    // 8. Invalidate/consume OTP record to prevent replay/reuse
    if (otpRecord?.id) {
      await this.otpRepository.delete(otpRecord.id);
    }

    // 9. Issue Auth Tokens
    const data = await this.issueAuthTokens(savedUser);

    this.logger.debug?.(
      `[UserRegistration] Completed registration for user #${savedUser.id} (${savedUser.role}) in ${(performance.now() - regStartTime).toFixed(2)}ms`,
    );

    return {
      message: 'User registration successful',
      ...data,
      ...(savedCustomerAddress && { address: savedCustomerAddress }),
      ...(savedPurohitServiceArea && { serviceArea: savedPurohitServiceArea }),
      ...(savedAstrologerProfile && { astrologerProfile: savedAstrologerProfile }),
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
      this.logger.warn(
        'Scramble phone cron skipped because environment is production',
      );
      return;
    }

    const targetPhones =
      phones && phones.length > 0
        ? phones
        : [
          '8468801711',
          '9358081535',
          '7082354083',
          '7668697182',
          '9354678205',
        ];

    for (const originalPhone of targetPhones) {
      const user = await this.userRepository.findOne({
        where: { phone: originalPhone },
      });

      if (user) {
        let newPhone = '';
        let isAlreadyUsed = true;

        while (isAlreadyUsed) {
          newPhone = this.generateRandomPhoneNumber();
          const existing = await this.userRepository.findOne({
            where: { phone: newPhone },
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
        this.logger.log(
          `Successfully scrambled phone ${originalPhone} -> ${newPhone} for user ID ${user.id}`,
        );
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

    const bookingStats = await this.bookingRepository.getPurohitDashboardStats(
      purohitProfile.id,
    );

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

    const [bookingStats, orderStats] = await Promise.all([
      this.bookingRepository.getCustomerDashboardStats(user.id),
      this.getCustomerOrderDashboardStats(user.id),
    ]);

    return {
      ...bookingStats,
      totalOrderCount: orderStats.totalOrders,
      totalDeliveredOrders: orderStats.deliveredOrders,
      totalPendingOrders: orderStats.pendingOrders,
    };
  }

  private async getCustomerOrderDashboardStats(customerId: number): Promise<{
    totalOrders: number;
    pendingOrders: number;
    deliveredOrders: number;
  }> {
    if (this.orderRepository) {
      return this.orderRepository.getCustomerDashboardOrderStats(customerId);
    }

    const pendingStatuses = [
      ORDER_STATUS.PENDING_PAYMENT,
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.PROCESSING,
      ORDER_STATUS.SHIPPED,
      ORDER_STATUS.OUT_FOR_DELIVERY,
    ];

    const query = this.dataSource
      .getRepository(Order)
      .createQueryBuilder('ord')
      .select('COUNT(*)', 'totalOrders')
      .addSelect(
        `COALESCE(SUM(CASE WHEN ord."orderStatus" IN (:...pendingStatuses) THEN 1 ELSE 0 END), 0)`,
        'pendingOrders',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN ord."orderStatus" = :delivered THEN 1 ELSE 0 END), 0)`,
        'deliveredOrders',
      )
      .where('ord.customerId = :customerId', { customerId });

    const result = await query
      .setParameters({
        pendingStatuses,
        delivered: ORDER_STATUS.DELIVERED,
      })
      .getRawOne();

    return {
      totalOrders: Number(result?.totalOrders) || 0,
      pendingOrders: Number(result?.pendingOrders) || 0,
      deliveredOrders: Number(result?.deliveredOrders) || 0,
    };
  }

  async getAdminDashboardStats(user: User) {
    if (user.role !== USER_ROLE.ADMIN) {
      throw new ForbiddenException('Only admins can access dashboard stats');
    }

    const [bookingStats, orderStats, activePurohits, activeCustomers] =
      await Promise.all([
        this.bookingRepository.getAdminDashboardStats(),
        this.getOrderDashboardStats(),
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

    const totalBookingRevenue = Number(bookingStats.totalRevenue) || 0;
    const totalOrderRevenue = Number(orderStats.totalOrderRevenue) || 0;
    const totalRevenue = Number(
      (totalBookingRevenue + totalOrderRevenue).toFixed(2),
    );
    const totalOrderCount = Number(orderStats.totalOrderCount) || 0;

    return {
      totalRevenue,
      totalBookingRevenue,
      totalOrderRevenue,
      totalBookingCount: bookingStats.totalBookings,
      totalOrderCount,
      activePurohits,
      activeCustomers,
    };
  }

  private async getOrderDashboardStats(): Promise<{
    totalOrderCount: number;
    totalOrderRevenue: number;
  }> {
    if (this.orderRepository) {
      return this.orderRepository.getAdminDashboardOrderStats();
    }

    const query = this.dataSource
      .getRepository(Order)
      .createQueryBuilder('ord')
      .select(
        `COUNT(CASE WHEN ord."orderStatus" != :pendingPayment THEN 1 END)`,
        'totalOrderCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN ord."paymentStatus" = :paid THEN ord."totalAmount" ELSE 0 END), 0)`,
        'totalOrderRevenue',
      );

    const result = await query
      .setParameters({
        pendingPayment: ORDER_STATUS.PENDING_PAYMENT,
        paid: ORDER_PAYMENT_STATUS.PAID,
      })
      .getRawOne();

    return {
      totalOrderCount: Number(result?.totalOrderCount) || 0,
      totalOrderRevenue: Number(
        Number(result?.totalOrderRevenue || 0).toFixed(2),
      ),
    };
  }
}
