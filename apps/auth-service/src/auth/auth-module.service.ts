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
import { User, USER_STATUS, USER_ROLE, Otp } from '@poojawala/entities';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
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
} from '@poojawala/dtos';
import { DataSource } from 'typeorm';
import { AUDIT_MODULE, ACTOR_TYPE } from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';
import { EmailService } from '@poojawala/email-services';
import { SmsService } from '@poojawala/sms-services';
import { MoreThan } from 'typeorm';
import { OTP_TYPE } from '@poojawala/entities';

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

    const passwordMatch = await bcrypt.compare(
      dto.password,
      user.hashedPassword,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === USER_STATUS.REJECTED) {
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

  async refreshToken(refreshToken: string) {
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      this.configService.get<string>('JWT_SECRET');

    if (!refreshSecret) {
      throw new InternalServerErrorException('JWT secret not configured');
    }

    try {
      // 1. Verify refresh token signature & expiration
      const payload = this.verifyJwt(refreshToken, refreshSecret);

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

    // 3. Delete previous OTP
    /* const whereCondition = dto.email
    ? { email: dto.email }
    : { phone: dto.phone };

  await this.otpRepository.delete(whereCondition);*/

    // 4. Generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // 5. Expiry
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 2);

    // 6. Save OTP
    const newOtp = this.otpRepository.create({
      email: dto.email,
      phone: dto.phone,
      otp: otpCode,
      expiresAt,
      role: user.role,
      isVerified: false,
      otpType: OTP_TYPE.RESET_PASSWORD,
    });

    await this.otpRepository.save(newOtp);

    // 7. Send OTP
    if (dto.phone) {
      await this.smsService.sendOtpSms(dto.phone, otpCode);

      return {
        message: 'OTP has been sent to your phone.',
      };
    }

    await this.emailService.sendOtpEmail(dto.email!, otpCode);

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
          expiresAt: MoreThan(new Date()),
          otpType: OTP_TYPE.RESET_PASSWORD,
        }
        : {
          phone: dto.phone,
          expiresAt: MoreThan(new Date()),
          otpType: OTP_TYPE.RESET_PASSWORD,
        },
    });

    if (!otp) {
      throw new BadRequestException('OTP is invalid or has expired');
    }

    // 4. Check OTP
    if (otp.otp !== dto.otp) {
      throw new BadRequestException('Invalid OTP');
    }

    // 5. Check expiry
    /* if (otp.expiresAt < new Date()) {
    throw new BadRequestException('OTP has expired');
  }*/

    const isSamePassword = await bcrypt.compare(
      dto.password,
      user.hashedPassword,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'New password cannot be same as old password',
      );
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

    // 3. Find existing OTP or generate new one
    let otpCode;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 2);

    const existingOtp = await this.otpRepository.findOne({
      where: dto.phone
        ? { phone: dto.phone, isVerified: false, otpType: dto.otpType }
        : { email: dto.email, isVerified: false, otpType: dto.otpType },
      order: { createdAt: 'DESC' },
    });

    if (existingOtp) {
      otpCode = existingOtp.otp;
      existingOtp.expiresAt = expiresAt;
      await this.otpRepository.save(existingOtp);
    } else {
      otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const newOtp = this.otpRepository.create({
        email: dto.email,
        phone: dto.phone,
        otp: otpCode,
        expiresAt,
        role: user.role,
        isVerified: false,
        otpType: dto.otpType,
      });

      await this.otpRepository.save(newOtp);
    }

    // 6. Send OTP
    if (dto.phone) {
      await this.smsService.sendOtpSms(dto.phone, otpCode);

      return {
        message: 'OTP has been sent to your phone.',
      };
    } else {
      await this.emailService.sendOtpEmail(dto.email!, otpCode);
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
}
