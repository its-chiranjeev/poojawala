import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { DataSource, QueryRunner, Not, EntityManager } from 'typeorm';
import { last, single } from 'rxjs';
import { UserRepository } from '@likemyproduct/repositories';
import { PurohitMedia, PurohitProfile, PUROHIT_MEDIA_TYPE, PUROHIT_MEDIA_VERIFICATION_STATUS, PUROHIT_VERIFICATION_STATUS, User, USER_ROLE, USER_STATUS } from '@likemyproduct/entities';
import { AuthModuleService } from 'apps/auth-service/src/auth/auth-module.service';
import { S3Service } from '@likemyproduct/s3';
import { UpdateUserDto, VerifyPurohitDto } from '@likemyproduct/dtos';
import { EmailService } from '@likemyproduct/email-services';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly dataSource: DataSource,
    private readonly authModuleService: AuthModuleService,
    private readonly s3Service: S3Service,
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

  private validatePurohitVerificationTransition(
    currentStatus: PUROHIT_VERIFICATION_STATUS,
    nextStatus: PUROHIT_VERIFICATION_STATUS,
  ): void {
    if (currentStatus === nextStatus) {
      return;
    }

    const allowedTransitions: Record<
      PUROHIT_VERIFICATION_STATUS, PUROHIT_VERIFICATION_STATUS[]
    > = {
      [PUROHIT_VERIFICATION_STATUS.PENDING]: [PUROHIT_VERIFICATION_STATUS.APPROVED, PUROHIT_VERIFICATION_STATUS.REJECTED],
      [PUROHIT_VERIFICATION_STATUS.APPROVED]: [PUROHIT_VERIFICATION_STATUS.REJECTED],
      [PUROHIT_VERIFICATION_STATUS.REJECTED]: [PUROHIT_VERIFICATION_STATUS.APPROVED],
    };

  const isAllowed = allowedTransitions[currentStatus]?.includes(nextStatus);

  if (!isAllowed) {
    throw new BadRequestException(`Purohit verification status cannot be changed from ${currentStatus} to ${nextStatus}`);
  }
}

  private isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) { return true;}
    if (typeof value === 'string') {return value.trim().length === 0;}
    if (Array.isArray(value)) {return value.length === 0;}
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
      'Aadhaar document': profile.aadhaarDocUrl,
      'PAN document': profile.panDocUrl,
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

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Purohit cannot be approved. Missing required details: ${missingFields.join(', ')}`,
      );
    }
    this.validatePurohitMedia(media);
  }

  private validatePurohitMedia(
    media: PurohitMedia[],
  ): void {
    const validMediaTypes = Object.values(PUROHIT_MEDIA_TYPE);

    const invalidMedia = media.find(
      ({ mediaUrl, mediaType }) => !mediaUrl?.trim() || !validMediaTypes.includes(mediaType),
    );

    if (invalidMedia) {
      throw new BadRequestException(`Purohit media record ${invalidMedia.id} is invalid`);
    }
  }

  private validateVerificationRequest(
    dto: VerifyPurohitDto,
  ): string | undefined {
    const rejectionReason = dto.rejectionReason?.trim();

    switch (dto.status) {
      case PUROHIT_VERIFICATION_STATUS.APPROVED:
        if (rejectionReason) {
          throw new BadRequestException('Rejection reason cannot be provided while approving a Purohit');
        }
        return undefined;

      case PUROHIT_VERIFICATION_STATUS.REJECTED:
        if (!rejectionReason) {
          throw new BadRequestException('Rejection reason is required when rejecting a Purohit');
        }
        return rejectionReason;

      default:
        throw new BadRequestException('Admin can only approve or reject a Purohit',);
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
        verificationStatus:
          PUROHIT_VERIFICATION_STATUS.APPROVED,
        rejectionReason: () => 'NULL',
      })
      .where('id = :profileId', { profileId })
      .execute();

    await mediaRepository
      .createQueryBuilder()
      .update(PurohitMedia)
      .set({
        verificationStatus:
          PUROHIT_MEDIA_VERIFICATION_STATUS.APPROVED,
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

  private async sendPurohitVerificationEmail(
    result: {
      userId: number;
      email?: string | null;
      firstName?: string | null;
      verificationStatus: PUROHIT_VERIFICATION_STATUS;
      rejectionReason: string | null;
    },
  ): Promise<boolean> {
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

    const result = await this.dataSource.transaction(
      async (manager) => {
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
          throw new ForbiddenException('Only an active admin can verify a Purohit');
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
          case PUROHIT_VERIFICATION_STATUS.APPROVED: this.validatePurohitForApproval(
            purohitUser,
            profile,
            media,
          );

            await this.approvePurohit(
              manager,
              purohitUser.id,
              profile.id,
            );
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

        const userStatus = dto.status === PUROHIT_VERIFICATION_STATUS.APPROVED ? USER_STATUS.ACTIVE : USER_STATUS.REJECTED;
        const mediaStatus = dto.status === PUROHIT_VERIFICATION_STATUS.APPROVED ? PUROHIT_MEDIA_VERIFICATION_STATUS.APPROVED : PUROHIT_MEDIA_VERIFICATION_STATUS.REJECTED;

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
            dto.status ===
            PUROHIT_VERIFICATION_STATUS.REJECTED
              ? rejectionReason!
              : null,
        };
      },
    );

    const emailSent = await this.sendPurohitVerificationEmail(result);

    const isApproved = result.verificationStatus === PUROHIT_VERIFICATION_STATUS.APPROVED;

    return {
      success: true,
      message: isApproved ? 'Purohit approved successfully' : 'Purohit rejected successfully',
      data: {
        userId: result.userId,
        profileId: result.profileId,
        userStatus: result.userStatus,
        verificationStatus:
          result.verificationStatus,
        mediaStatus: result.mediaStatus,
        updatedMediaCount:
          result.updatedMediaCount,
        rejectionReason:
          result.rejectionReason,
        emailSent,
      },
    };
  }
}