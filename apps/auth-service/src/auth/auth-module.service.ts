import {
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRepository, OtpRepository } from '@poojawala/repositories';
import * as bcrypt from 'bcryptjs';
import axios from 'axios';
import {
  User,
  USER_STATUS,
  USER_ROLE,
  Otp,
  PurohitProfile,
  PUROHIT_VERIFICATION_STATUS,
} from '@poojawala/entities';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import {
  LoginDto,
  RegisterSuperAdminDto,
  VerifyOtpDto,
  OtpDto,
  RegisterNormalUserDto,
  RegisterUserDto,
  resetPasswordDto,
  forgotPasswordDto,
  ResendOtpDto,
  SwitchIntentDto,
} from '@poojawala/dtos';
import { DataSource } from 'typeorm';
import { AUDIT_MODULE, ACTOR_TYPE } from '@poojawala/entities';
import {
  AuditLogService,
  generateSecureOtp,
  hashOtp,
  verifyOtpHash,
  DEFAULT_OTP_EXPIRY_SECONDS,
  MAX_OTP_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
} from '@poojawala/common';
import { EmailService } from '@poojawala/email-services';
import { SmsService } from '@poojawala/sms-services';
import { MoreThan } from 'typeorm';
import { OTP_TYPE } from '@poojawala/entities';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
}

@Injectable()
export class AuthModuleService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly otpRepository: OtpRepository,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly auditLogService: AuditLogService,
  ) { }

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

    let verificationStatus: PUROHIT_VERIFICATION_STATUS | undefined;
    let rejectionReason: string | null | undefined;

    if (user.role === USER_ROLE.PUROHIT) {
      try {
        const profile = await this.dataSource
          .getRepository(PurohitProfile)
          .findOne({ where: { userId: user.id } });
        if (profile) {
          verificationStatus = profile.verificationStatus;
          rejectionReason = profile.rejectionReason ?? null;
        }
      } catch {
        // Gracefully ignore profile lookup error
      }
    }

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
        status: user.status,
        profileImage: user.profileImage,
        isAdminCreated: user.isAdminCreated,
        ...(user.role === USER_ROLE.PUROHIT && {
          verificationStatus,
          rejectionReason,
        }),
      },
    };
  }

  signJwt(
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

  base64UrlEncode(value: string): string {
    return Buffer.from(value).toString('base64url');
  }

  // async generateOtpService(dto: RegisterUserDto) {
  //   if (!dto.phone) {
  //     throw new BadRequestException('Phone number is required');
  //   }

  //   if (
  //     ![USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ADMIN].includes(
  //       dto.role,
  //     )
  //   ) {
  //     throw new BadRequestException('Invalid role');
  //   }

  //   // 2. Verify if user already exists by phone
  //   if (dto.phone) {
  //     const existingUserByPhone = await this.userRepository.findOne({
  //       where: { phone: dto.phone },
  //     });
  //     if (existingUserByPhone) {
  //       throw new ConflictException('Phone number already in use');
  //     }
  //     const verifyAccount = await this.otpRepository.findOne({
  //       where: { phone: dto.phone },
  //     });
  //     if (verifyAccount) {
  //       await this.otpRepository.delete(verifyAccount.id);
  //     }
  //   }

  //   // 5. Generate a 6-digit numeric OTP
  //   const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  //   if (dto.phone) {
  //     await this.smsService.sendOtpSms(dto.phone, otpCode);
  //   }

  //   // 6. Save OTP to database
  //   const expiresAt = new Date();
  //   expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP expires in 10 minutes

  //   const newOtp = this.otpRepository.create({
  //     ...(dto.email && { email: dto.email }),
  //     ...(dto.phone && { phone: dto.phone }),
  //     otp: otpCode,
  //     expiresAt,
  //     role: dto.role,
  //     isVerified: false,
  //   });

  //   await this.otpRepository.save(newOtp);

  //   return {
  //     message: 'OTP has been sent.',
  //     email: dto.email,
  //     phone: dto.phone,
  //   };
  // }

  // async verifyOtpService(dto: VerifyOtpDto) {
  //   const otpRecord = await this.otpRepository.findOne({
  //     where: {
  //       phone: dto.phone,
  //       otp: dto.otp,
  //       isVerified: false,
  //     },
  //   });

  //   if (!otpRecord) {
  //     throw new BadRequestException('Invalid OTP code or phone');
  //   }

  //   if (otpRecord.expiresAt < new Date()) {
  //     throw new BadRequestException('OTP has expired');
  //   }

  //   await this.otpRepository.update(otpRecord.id, { isVerified: true });
  //   return {
  //     message: 'OTP verified successfully',
  //   };
  // }

  async logoutService(userId: string | number) {
    const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const user = await this.userRepository.findById(numericUserId);

    await this.userRepository.update(userId, {
      hashedRefreshToken: undefined,
    });

    if (user) {
      await this.auditLogService.createAuditLog({
        actorId: numericUserId,
        actorType: ACTOR_TYPE.USER,
        actorRole: user.role,
        module: AUDIT_MODULE.AUTH,
        entity: 'Auth',
        entityId: String(numericUserId),
        action: 'USER_LOGOUT',
        message: `User #${numericUserId} logged out.`,
      });
    }

    return {
      message: 'Logout successful',
    };
  }

  async loginService(dto: LoginDto) {
    const user = await this.userRepository.findByEmailOrUsername(dto.email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.hashedPassword) {
      throw new UnauthorizedException(
        'Please log in with Google or reset your password to create one',
      );
    }

    const passwordMatch = await bcrypt.compare(
      dto.password,
      user.hashedPassword,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === USER_STATUS.REJECTED) {
      user.hashedRefreshToken = null;
      await this.userRepository.save(user);
      throw new ForbiddenException('Your profile is Rejected By Admin');
    }

    if (user.status === USER_STATUS.BLOCKED) {
      user.hashedRefreshToken = null; // Invalidate existing refresh tokens

      await this.userRepository.save(user);
      throw new ForbiddenException('Your Profile Is Blocked');
    }
    const data = await this.issueAuthTokens(user);

    await this.auditLogService.createAuditLog({
      actorId: user.id,
      actorType: ACTOR_TYPE.USER,
      actorRole: user.role,
      module: AUDIT_MODULE.AUTH,
      entity: 'Auth',
      entityId: String(user.id),
      action: 'USER_LOGIN',
      message: `User #${user.id} logged in.`,
    });

    return {
      message: 'Login successful',
      ...data,
    };
  }

  private verifyJwt(token: string, secret: string): Record<string, any> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid token format');
    }

    const [header, body, signature] = parts;
    const data = `${header}.${body}`;
    const expectedSignature = createHmac('sha256', secret)
      .update(data)
      .digest('base64url');

    if (signature !== expectedSignature) {
      throw new UnauthorizedException('Invalid token signature');
    }

    let decodedBody: any;
    try {
      decodedBody = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid token payload');
    }

    const now = Math.floor(Date.now() / 1000);
    if (decodedBody.exp && now > decodedBody.exp) {
      throw new UnauthorizedException('Token has expired');
    }

    return decodedBody;
  }

  async refreshToken(refreshToken: string, expectedRole?: USER_ROLE) {
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      this.configService.get<string>('JWT_SECRET');

    if (!refreshSecret) {
      throw new InternalServerErrorException('JWT secret not configured');
    }

    try {
      // 1. Verify refresh token signature & expiration
      const payload = this.verifyJwt(refreshToken, refreshSecret);

      if (expectedRole && payload.role !== expectedRole) {
        throw new UnauthorizedException(
          `Refresh token role '${payload.role}' does not match expected role '${expectedRole}'`,
        );
      }

      // 2. Find user
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // 3. Compare refresh token with DB hash
      if (!user.hashedRefreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isValid = await bcrypt.compare(
        refreshToken,
        user.hashedRefreshToken,
      );

      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // 4. Optional security check
      if (user.status !== USER_STATUS.ACTIVE) {
        throw new ForbiddenException('User is not active');
      }

      // 5. Token version check
      if (user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Session expired');
      }

      // 6. Issue new tokens (rotation)
      return this.issueAuthTokens(user);
    } catch (e) {
      if (e instanceof UnauthorizedException || e instanceof ForbiddenException) {
        throw e;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async registerSuperAdminService(dto: RegisterSuperAdminDto) {
    const existingUser = await this.userRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newUser = this.userRepository.create({
      email: dto.email.toLowerCase(),
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      hashedPassword: hashedPassword,
      role: USER_ROLE.ADMIN,
    });

    const savedUser = await this.userRepository.save(newUser);

    const data = await this.issueAuthTokens(savedUser);

    return {
      message: 'Admin registration successful',
      ...data,
    };
  }

  /* async registerUserService(dto: RegisterNormalUserDto) {
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
  }*/

  async forgotPasswordService(dto: forgotPasswordDto) {
    // 1. Validate input
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Either phone or email must be provided');
    }

    let user;

    // 2. Find user
    if (dto.phone) {
      user = await this.userRepository.findOne({
        where: { phone: dto.phone },
      });

      if (!user) {
        throw new NotFoundException('User with this phone number not found');
      }
    } else {
      user = await this.userRepository.findByEmail(dto.email!);

      if (!user) {
        throw new NotFoundException('User with this email not found');
      }
    }

    if (user.isVerified === false) {
      throw new BadRequestException(
        'User is not verified. Please verify your account first.',
      );
    }

    // 3. Check resend cooldown / rate limiting
    const existingActiveOtp = await this.otpRepository.findOne({
      where: dto.phone
        ? { phone: dto.phone, otpType: OTP_TYPE.RESET_PASSWORD }
        : { email: dto.email, otpType: OTP_TYPE.RESET_PASSWORD },
      order: { id: 'DESC' },
    });

    if (existingActiveOtp && !existingActiveOtp.isVerified) {
      const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;
      const elapsedMs = Date.now() - new Date(existingActiveOtp.createdAt).getTime();
      if (elapsedMs < cooldownMs) {
        const remainingSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
        throw new BadRequestException(
          `Please wait ${remainingSec} second(s) before requesting another OTP.`,
        );
      }
    }

    // Invalidate previous OTP(s) for this purpose
    const whereCondition = dto.email
      ? { email: dto.email, otpType: OTP_TYPE.RESET_PASSWORD }
      : { phone: dto.phone, otpType: OTP_TYPE.RESET_PASSWORD };
    await this.otpRepository.delete(whereCondition);

    // 4. Generate cryptographically secure OTP
    // TODO: FAST2SMS_OTP_FIX - Previous non-cryptographic Math.random() generation:
    // const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpCode = generateSecureOtp(6);
    const hashedOtp = hashOtp(otpCode);

    // 5. Expiry
    const configuredExpiry = this.configService.get<string>('OTP_EXPIRY_SECONDS');
    const expirySeconds = configuredExpiry
      ? parseInt(configuredExpiry, 10)
      : DEFAULT_OTP_EXPIRY_SECONDS;
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    // 6. Save OTP
    const newOtp = this.otpRepository.create({
      email: dto.email,
      phone: dto.phone,
      otp: hashedOtp,
      attempts: 0,
      expiresAt,
      role: user.role,
      isVerified: false,
      otpType: OTP_TYPE.RESET_PASSWORD,
    });

    await this.otpRepository.save(newOtp);

    // 7. Send OTP
    if (dto.phone) {
      try {
        // Pass the backend-generated OTP to Fast2SMS
        // TODO: FAST2SMS_MIGRATION - Previous call without backend OTP:
        // await this.smsService.sendOtpViaFast2sms(dto.phone);
        await this.smsService.sendOtpViaFast2sms(dto.phone, otpCode);
      } catch (smsError) {
        // Clean up un-delivered OTP record to prevent inconsistent state
        await this.otpRepository.delete(newOtp.id);
        throw smsError;
      }

      return {
        message: 'OTP has been sent to your phone.',
      };
    }

    try {
      await this.emailService.sendOtpEmail(dto.email!, otpCode);
    } catch (emailError) {
      await this.otpRepository.delete(newOtp.id);
      throw emailError;
    }

    return {
      message: 'OTP has been sent to your email.',
    };
  }

  async resetPasswordService(dto: resetPasswordDto) {
    // 1. Validate input
    if (!dto.phone && !dto.email) {
      throw new BadRequestException('Either phone or email must be provided');
    }

    // 2. Find user
    let user;

    if (dto.phone) {
      user = await this.userRepository.findOne({
        where: { phone: dto.phone },
      });
    } else {
      user = await this.userRepository.findByEmail(dto.email!);
    }

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 3. Find OTP
    const otp = await this.otpRepository.findOne({
      where: dto.email
        ? {
          email: dto.email,
          otpType: OTP_TYPE.RESET_PASSWORD,
        }
        : {
          phone: dto.phone,
          otpType: OTP_TYPE.RESET_PASSWORD,
        },
      order: { id: 'DESC' },
    });

    if (!otp) {
      throw new BadRequestException('OTP is invalid or has expired');
    }

    if (otp.expiresAt < new Date()) {
      throw new BadRequestException('OTP has expired');
    }

    if ((otp.attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException(
        'Maximum verification attempts exceeded. Please request a new OTP.',
      );
    }

    // 4. Secure timing-safe hash check
    // TODO: FAST2SMS_OTP_FIX - Previous plaintext check:
    // if (otp.otp !== dto.otp) {
    //   throw new BadRequestException('Invalid OTP');
    // }
    const isMatch = verifyOtpHash(dto.otp, otp.otp);

    if (!isMatch) {
      otp.attempts = (otp.attempts ?? 0) + 1;
      await this.otpRepository.save(otp);
      throw new BadRequestException('Invalid OTP');
    }

    if (user.hashedPassword) {
      const isSamePassword = await bcrypt.compare(
        dto.password,
        user.hashedPassword,
      );

      if (isSamePassword) {
        throw new BadRequestException(
          'New password cannot be same as old password',
        );
      }
    }

    // 6. Hash new password
    user.hashedPassword = await bcrypt.hash(dto.password, 10);
    user.hashedRefreshToken = null; // Invalidate existing refresh tokens
    user.tokenVersion += 1; // Increment token version to invalidate existing tokens

    await this.userRepository.save(user);

    // 7. Delete OTP
    await this.otpRepository.delete(otp.id);

    return {
      message: 'Password reset successfully',
    };
  }

  async resendOtpService(dto: ResendOtpDto) {
    // 1. Validate input
    if (!dto.phone && !dto.email) {
      throw new BadRequestException('Either phone or email must be provided');
    }
    let user;

    // 2. Find user
    if (dto.phone) {
      user = await this.userRepository.findOne({
        where: { phone: dto.phone },
      });

      if (!user) {
        throw new NotFoundException('User with this phone number not found');
      }
    } else {
      user = await this.userRepository.findByEmail(dto.email!);

      if (!user) {
        throw new NotFoundException('User with this email not found');
      }
    }

    // 3. Find existing OTP and enforce resend cooldown
    const existingOtp = await this.otpRepository.findOne({
      where: dto.phone
        ? { phone: dto.phone, otpType: dto.otpType }
        : { email: dto.email, otpType: dto.otpType },
      order: { id: 'DESC' },
    });

    if (existingOtp && !existingOtp.isVerified) {
      const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;
      const elapsedMs = Date.now() - new Date(existingOtp.createdAt).getTime();
      if (elapsedMs < cooldownMs) {
        const remainingSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
        throw new BadRequestException(
          `Please wait ${remainingSec} second(s) before requesting another OTP.`,
        );
      }
    }

    // 4. Invalidate previous OTP(s)
    // TODO: FAST2SMS_OTP_FIX - Previously reused existing OTP:
    // if (existingOtp) { otpCode = existingOtp.otp; ... }
    if (existingOtp) {
      await this.otpRepository.delete(existingOtp.id);
    }

    // 5. Generate fresh cryptographically secure OTP and hash
    const otpCode = generateSecureOtp(6);
    const hashedOtp = hashOtp(otpCode);

    const configuredExpiry = this.configService.get<string>('OTP_EXPIRY_SECONDS');
    const expirySeconds = configuredExpiry
      ? parseInt(configuredExpiry, 10)
      : DEFAULT_OTP_EXPIRY_SECONDS;
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    const newOtp = this.otpRepository.create({
      email: dto.email,
      phone: dto.phone,
      otp: hashedOtp,
      attempts: 0,
      expiresAt,
      role: user.role,
      isVerified: false,
      otpType: dto.otpType,
    });

    await this.otpRepository.save(newOtp);

    // 6. Send OTP
    if (dto.phone) {
      try {
        // Pass backend OTP to Fast2SMS
        // TODO: FAST2SMS_MIGRATION - Previous call without backend OTP:
        // await this.smsService.sendOtpViaFast2sms(dto.phone);
        await this.smsService.sendOtpViaFast2sms(dto.phone, otpCode);
      } catch (smsError) {
        await this.otpRepository.delete(newOtp.id);
        throw smsError;
      }

      return {
        message: 'OTP has been sent to your phone.',
      };
    } else {
      try {
        await this.emailService.sendOtpEmail(dto.email!, otpCode);
      } catch (emailError) {
        await this.otpRepository.delete(newOtp.id);
        throw emailError;
      }
    }

    return {
      message: 'OTP has been sent to your email.',
    };
  }

  async getFullProfile(userId: number, role: USER_ROLE) {
    const user = await this.userRepository.getFullProfile(userId, role);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } =
      user;
    return safeUser;
  }

  async verifyGoogleToken(idToken: string): Promise<GoogleIdentity> {
    if (!idToken || typeof idToken !== 'string') {
      throw new BadRequestException('Google ID token is required');
    }

    try {
      const res = await axios.get(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`,
        { timeout: 10000 },
      );
      const data = res.data;

      const configuredClientId = this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim();
      if (configuredClientId && data.aud !== configuredClientId) {
        throw new UnauthorizedException('Google token audience does not match configured client ID');
      }

      const isVerified = data.email_verified === true || data.email_verified === 'true';
      if (!isVerified) {
        throw new UnauthorizedException('Google email is not verified');
      }

      if (!data.sub || !data.email) {
        throw new UnauthorizedException('Invalid Google token payload');
      }

      return {
        sub: String(data.sub).trim(),
        email: String(data.email).trim().toLowerCase(),
        emailVerified: true,
        name: data.name,
        givenName: data.given_name,
        familyName: data.family_name,
        picture: data.picture,
      };
    } catch (error: any) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      const message =
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        error.message ||
        'Google token verification failed';
      throw new UnauthorizedException(`Google token verification failed: ${message}`);
    }
  }

  getGoogleCallbackUrl(): string {
    const configured =
      this.configService.get<string>('GOOGLE_CALLBACK_URL')?.trim() ||
      process.env['GOOGLE_CALLBACK_URL']?.trim();
    if (!configured) {
      throw new InternalServerErrorException(
        'GOOGLE_CALLBACK_URL is not configured in environment variables',
      );
    }
    return configured;
  }

  getFrontendUrl(): string {
    const configured =
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      process.env['FRONTEND_URL']?.trim();
    if (!configured) {
      throw new InternalServerErrorException(
        'FRONTEND_URL is not configured in environment variables',
      );
    }
    return configured.replace(/\/+$/, '');
  }

  getGoogleOAuthRedirect(roleParam?: string): { url: string; state: string } {
    if (!roleParam || typeof roleParam !== 'string' || !roleParam.trim()) {
      throw new BadRequestException('Role is required for Google authentication');
    }

    const normalizedRole = roleParam.trim().toUpperCase();

    if (normalizedRole === USER_ROLE.ADMIN) {
      throw new BadRequestException('ADMIN role is not allowed for Google authentication');
    }

    if (
      normalizedRole !== USER_ROLE.CUSTOMER &&
      normalizedRole !== USER_ROLE.PUROHIT
    ) {
      throw new BadRequestException(
        `Invalid role: ${roleParam}. Only CUSTOMER and PUROHIT are allowed for Google authentication`,
      );
    }

    const role = normalizedRole as USER_ROLE.CUSTOMER | USER_ROLE.PUROHIT;

    const clientId =
      this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim() ||
      process.env['GOOGLE_CLIENT_ID']?.trim();

    if (!clientId) {
      throw new BadRequestException('Google Client ID is not configured');
    }

    const callbackUrl = this.getGoogleCallbackUrl();
    const nonce = randomBytes(16).toString('hex');
    const statePayload = JSON.stringify({ role, nonce });
    const encodedState = Buffer.from(statePayload).toString('base64url');

    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=openid%20email%20profile&state=${encodeURIComponent(encodedState)}&access_type=offline&prompt=select_account`;

    return { url, state: encodedState };
  }

  async processGoogleOAuthCallback(code: string, state: string) {
    let role = USER_ROLE.CUSTOMER;
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      if (parsed.role === USER_ROLE.PUROHIT) {
        role = USER_ROLE.PUROHIT;
      }
    } catch {
      // default to CUSTOMER
    }

    const callbackUrl = this.getGoogleCallbackUrl();
    const identity = await this.exchangeGoogleCode(code, callbackUrl);
    const result = await this.handleGoogleAuth(identity, role);

    const csrfToken = randomUUID();
    const frontendUrl = this.getFrontendUrl();

    let redirectUrl: string;
    if (result.isNewUser && result.user.role === USER_ROLE.PUROHIT) {
      redirectUrl = `${frontendUrl}/purohit/onboarding?csrfToken=${encodeURIComponent(csrfToken)}`;
    } else {
      redirectUrl = `${frontendUrl}/auth/callback?role=${result.user.role}&status=${result.user.status}&csrfToken=${encodeURIComponent(csrfToken)}`;
    }

    return {
      result,
      redirectUrl,
      csrfToken,
    };
  }

  async exchangeGoogleCode(code: string, callbackUrl?: string): Promise<GoogleIdentity> {
    if (!code || typeof code !== 'string') {
      throw new BadRequestException('Google authorization code is required');
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim();
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET')?.trim();

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException('Google OAuth client credentials not configured');
    }

    const redirectUri = callbackUrl || this.getGoogleCallbackUrl();

    try {
      const params = new URLSearchParams();
      params.append('code', code.trim());
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('redirect_uri', redirectUri);
      params.append('grant_type', 'authorization_code');

      const res = await axios.post(
        'https://oauth2.googleapis.com/token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        },
      );

      const idToken = res.data?.id_token;
      if (!idToken) {
        throw new UnauthorizedException('No ID token received from Google');
      }

      return await this.verifyGoogleToken(idToken);
    } catch (error: any) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      const message =
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        error.message ||
        'Google code exchange failed';
      throw new UnauthorizedException(`Google code exchange failed: ${message}`);
    }
  }

  async handleGoogleAuth(identity: GoogleIdentity, requestedRole?: USER_ROLE) {
    if (!identity.emailVerified) {
      throw new UnauthorizedException('Google email must be verified');
    }

    if (!identity.sub) {
      throw new UnauthorizedException('Google sub identity is required');
    }

    const normalizedEmail = identity.email.trim().toLowerCase();

    // Never allow ADMIN role via Google auth
    const safeRole =
      requestedRole === USER_ROLE.PUROHIT
        ? USER_ROLE.PUROHIT
        : USER_ROLE.CUSTOMER;

    // Step 1 — Search by Google ID (sub)
    let user = await this.userRepository.findByGoogleId(identity.sub);

    if (user) {
      if (user.status === USER_STATUS.BLOCKED) {
        throw new ForbiddenException('Your profile is blocked');
      }
      if (user.status === USER_STATUS.REJECTED) {
        throw new ForbiddenException('Your profile is rejected by admin');
      }

      const tokenData = await this.issueAuthTokens(user);

      await this.auditLogService.createAuditLog({
        actorId: user.id,
        actorType: ACTOR_TYPE.USER,
        actorRole: user.role,
        module: AUDIT_MODULE.AUTH,
        entity: 'Auth',
        entityId: String(user.id),
        action: 'USER_LOGIN',
        message: `User #${user.id} logged in via Google.`,
      });

      return {
        message: 'Login successful',
        isNewUser: false,
        ...tokenData,
      };
    }

    // Step 2 — Search by normalized verified email (Collision Protection & Safe Account Linking)
    user = await this.userRepository.findByEmail(normalizedEmail);

    if (user) {
      // Email collision protection:
      // If user's googleId belongs to a DIFFERENT Google sub, reject!
      if (user.googleId && user.googleId !== identity.sub) {
        throw new ConflictException(
          'This email is already associated with another Google account',
        );
      }

      // Safe linking: user's googleId is null
      if (!user.googleId) {
        user.googleId = identity.sub;
        if (!user.authProvider || user.authProvider === 'LOCAL') {
          user.authProvider = 'GOOGLE';
        }
        if (!user.profileImage && identity.picture) {
          user.profileImage = identity.picture;
        }
        await this.userRepository.save(user);

        await this.auditLogService.createAuditLog({
          actorId: user.id,
          actorType: ACTOR_TYPE.USER,
          actorRole: user.role,
          module: AUDIT_MODULE.AUTH,
          entity: 'Auth',
          entityId: String(user.id),
          action: 'ACCOUNT_LINKED_GOOGLE',
          message: `User #${user.id} linked Google account.`,
        });
      }

      if (user.status === USER_STATUS.BLOCKED) {
        throw new ForbiddenException('Your profile is blocked');
      }
      if (user.status === USER_STATUS.REJECTED) {
        throw new ForbiddenException('Your profile is rejected by admin');
      }

      const tokenData = await this.issueAuthTokens(user);
      return {
        message: 'Google account linked and login successful',
        isNewUser: false,
        ...tokenData,
      };
    }

    // Step 3 — New account creation (with collision & concurrency protection)
    const baseName =
      (identity.name || identity.email.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20) || 'user';
    let candidateUsername = `${baseName}_${identity.sub.slice(-6)}`;
    const existingUsername = await this.userRepository.findOne({
      where: { username: candidateUsername },
    });
    if (existingUsername) {
      candidateUsername = `${baseName}_${Date.now().toString().slice(-6)}`;
    }

    const isPurohit = safeRole === USER_ROLE.PUROHIT;

    try {
      const savedUser = await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const profileRepo = manager.getRepository(PurohitProfile);

        const newUser = userRepo.create({
          email: normalizedEmail,
          username: candidateUsername,
          firstName: identity.givenName || identity.name?.split(' ')[0] || '',
          lastName: identity.familyName || identity.name?.split(' ').slice(1).join(' ') || '',
          profileImage: identity.picture || undefined,
          googleId: identity.sub,
          authProvider: 'GOOGLE',
          role: isPurohit ? USER_ROLE.PUROHIT : USER_ROLE.CUSTOMER,
          status: USER_STATUS.ACTIVE,
          tokenVersion: 1,
        });

        const createdUser = await userRepo.save(newUser);

        if (isPurohit) {
          const profile = profileRepo.create({
            userId: createdUser.id,
            verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
          });
          await profileRepo.save(profile);
        }

        return createdUser;
      });

      const tokenData = await this.issueAuthTokens(savedUser);

      await this.auditLogService.createAuditLog({
        actorId: savedUser.id,
        actorType: ACTOR_TYPE.USER,
        actorRole: savedUser.role,
        module: AUDIT_MODULE.AUTH,
        entity: 'Auth',
        entityId: String(savedUser.id),
        action: isPurohit ? 'PUROHIT_REGISTER_GOOGLE' : 'CUSTOMER_REGISTER_GOOGLE',
        message: `User #${savedUser.id} registered via Google (${savedUser.role}).`,
      });

      return {
        message: isPurohit
          ? 'Purohit registration successful. Profile pending verification.'
          : 'Customer registration successful',
        isNewUser: true,
        ...tokenData,
      };
    } catch (err: any) {
      // Handle concurrent signup collisions (PostgreSQL unique constraint 23505)
      if (
        err.code === '23505' ||
        err.message?.includes('duplicate key') ||
        err.message?.includes('unique constraint')
      ) {
        const existing =
          (await this.userRepository.findByGoogleId(identity.sub)) ||
          (await this.userRepository.findByEmail(normalizedEmail));

        if (existing) {
          if (existing.googleId && existing.googleId !== identity.sub) {
            throw new ConflictException(
              'This email is already associated with another Google account',
            );
          }
          if (!existing.googleId) {
            existing.googleId = identity.sub;
            await this.userRepository.save(existing);
          }
          const tokenData = await this.issueAuthTokens(existing);
          return {
            message: 'Login successful',
            isNewUser: false,
            ...tokenData,
          };
        }
      }
      throw err;
    }
  }

  // async switchIntentService(userId: number, dto: SwitchIntentDto) {
  //   if (dto.intent !== USER_ROLE.PUROHIT) {
  //     throw new BadRequestException('Only switching to PUROHIT is supported');
  //   }

  //   const user = await this.userRepository.findOne({ where: { id: userId } });
  //   if (!user) {
  //     throw new NotFoundException('User not found');
  //   }

  //   if (user.role === USER_ROLE.PUROHIT) {
  //     const tokenData = await this.issueAuthTokens(user);
  //     return {
  //       message: 'Account is already a Purohit',
  //       ...tokenData,
  //     };
  //   }

  //   if (user.role === USER_ROLE.ADMIN) {
  //     throw new ForbiddenException('Admin cannot switch role to Purohit');
  //   }

  //   await this.dataSource.transaction(async (manager) => {
  //     const userRepo = manager.getRepository(User);
  //     const profileRepo = manager.getRepository(PurohitProfile);

  //     user.role = USER_ROLE.PUROHIT;
  //     user.status = USER_STATUS.PENDING;
  //     await userRepo.save(user);

  //     let profile = await profileRepo.findOne({ where: { userId: user.id } });
  //     if (!profile) {
  //       profile = profileRepo.create({
  //         userId: user.id,
  //         verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
  //       });
  //       await profileRepo.save(profile);
  //     }
  //   });

  //   const tokenData = await this.issueAuthTokens(user);
  //   return {
  //     message: 'Purohit onboarding initiated. Profile pending admin verification.',
  //     ...tokenData,
  //   };
}

