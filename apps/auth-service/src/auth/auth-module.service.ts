import {
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRepository, OtpRepository } from '@likemyproduct/repositories';
import * as bcrypt from 'bcryptjs';
import { User, USER_STATUS, USER_ROLE, Otp } from '@likemyproduct/entities';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import {
  LoginDto,
  RegisterSuperAdminDto,
  VerifyOtpDto,
  OtpDto,
  RegisterNormalUserDto,
  RegisterUserDto,
} from '@likemyproduct/dtos';
import { DataSource } from 'typeorm';
import { EmailService } from '@likemyproduct/email-services';
import { SmsService } from '@likemyproduct/sms-services';

@Injectable()
export class AuthModuleService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly otpRepository: OtpRepository,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
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

  async generateOtpService(dto: RegisterUserDto) {
    if (!dto.phone) {
      throw new BadRequestException('Phone number is required');
    }

    if (![USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ADMIN].includes(dto.role)) {
      throw new BadRequestException('Invalid role');
    }

    // 2. Verify if user already exists by phone
    if (dto.phone) {
      const existingUserByPhone = await this.userRepository.findOne({
        where: { phone: dto.phone },
      });
      if (existingUserByPhone) {
        throw new ConflictException('Phone number already in use');
      }
      const verifyAccount = await this.otpRepository.findOne({
        where: { phone: dto.phone },
      });
      if (verifyAccount) {
        await this.otpRepository.delete(verifyAccount.id);
      }
    }

    // 5. Generate a 6-digit numeric OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    if (dto.phone) {
      await this.smsService.sendOtpSms(dto.phone, otpCode);
    }

    // 6. Save OTP to database
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP expires in 10 minutes

    const newOtp = this.otpRepository.create({
      ...(dto.email && { email: dto.email }),
      ...(dto.phone && { phone: dto.phone }),
      otp: otpCode,
      expiresAt,
      role: dto.role,
      isVerified: false,
    });

    await this.otpRepository.save(newOtp);

    return {
      message: 'OTP has been sent.',
      email: dto.email,
      phone: dto.phone,
    };
  }

  async verifyOtpService(dto: VerifyOtpDto) {
    const otpRecord = await this.otpRepository.findOne({
      where: {
        phone: dto.phone,
        otp: dto.otp,
        isVerified: false,
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid OTP code or phone');
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new BadRequestException('OTP has expired');
    }

    await this.otpRepository.update(otpRecord.id, { isVerified: true });
    return {
      message: 'OTP verified successfully',
    };
  }

  async logoutService(userId: string | number) {
    await this.userRepository.update(userId, {
      hashedRefreshToken: undefined,
    });
    return {
      message: 'Logout successful',
    };
  }

  async loginService(dto: LoginDto) {
    const user = await this.userRepository.findByEmailOrUsername(dto.email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.hashedPassword);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (
      user.status === USER_STATUS.BLOCKED ||
      user.status === USER_STATUS.INACTIVE
    ) {
      throw new ForbiddenException('User is blocked');
    }
    const data = await this.issueAuthTokens(user);
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
      throw new UnauthorizedException(e.message || 'Invalid refresh token');
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
        status: USER_STATUS.ACTIVE,
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
}
