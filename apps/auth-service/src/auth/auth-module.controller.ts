import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthModuleService } from './auth-module.service';
import { JwtAuthGuard, CsrfGuard } from '@likemyproduct/common';
import { LoginDto, VerifyOtpDto, RegisterSuperAdminDto, RegisterNormalUserDto, OtpDto, RegisterUserDto } from '@likemyproduct/dtos';
import type { Response } from 'express';
import * as crypto from 'crypto';
import { S3Service } from '@likemyproduct/s3';

@Controller('auth')
export class AuthModuleController {
  constructor(
    private readonly authModuleService: AuthModuleService,
    private readonly s3Service: S3Service,
  ) { }

  @Post('generate-otp')
  @HttpCode(HttpStatus.OK)
  async generateOtp(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: RegisterUserDto,
  ) {
    return this.authModuleService.generateOtpService(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: VerifyOtpDto,
  ) {
    return this.authModuleService.verifyOtpService(dto);
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string, csrfToken: string) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    res.cookie('csrf-token', csrfToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  private clearAuthCookies(res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('accessToken', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
    res.clearCookie('refreshToken', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
    res.clearCookie('csrf-token', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
  }

  private parseCookies(cookieHeader?: string): Record<string, string> {
    const list: Record<string, string> = {};
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      list[parts.shift()!.trim()] = decodeURIComponent(parts.join('='));
    });
    return list;
  }

  // [EXISTING CODE]
  // @Post('register-super-admin')
  // @HttpCode(HttpStatus.CREATED)
  // async registerSuperAdmin(@Body(new ValidationPipe()) dto: RegisterSuperAdminDto) {
  //   return this.authModuleService.registerSuperAdminService(dto);
  // }

  @Post('register-super-admin')
  @HttpCode(HttpStatus.CREATED)
  async registerSuperAdmin(
    @Body(new ValidationPipe()) dto: RegisterSuperAdminDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authModuleService.registerSuperAdminService(dto);
    const csrfToken = crypto.randomUUID();
    this.setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken, csrfToken);

    if (result.user && result.user.profileImage) {
      try {
        result.user.profileImage = await this.s3Service.getDownloadUrl(result.user.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: result.message,
      csrfToken,
      user: result.user,
    };
  }

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body(new ValidationPipe()) dto: OtpDto) {
    return this.authModuleService.generateOtpService(dto);
  }

  // [EXISTING CODE]
  // @Post('register-user')
  // @HttpCode(HttpStatus.CREATED)
  // async registerUser(@Body(new ValidationPipe()) dto: RegisterNormalUserDto) {
  //   return this.authModuleService.registerUserService(dto);
  // }

  @Post('register-user')
  @HttpCode(HttpStatus.CREATED)
  async registerUser(
    @Body(new ValidationPipe()) dto: RegisterNormalUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authModuleService.registerUserService(dto);
    const csrfToken = crypto.randomUUID();
    this.setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken, csrfToken);

    if (result.user && result.user.profileImage) {
      try {
        result.user.profileImage = await this.s3Service.getDownloadUrl(result.user.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: result.message,
      csrfToken,
      user: result.user,
    };
  }

  // [EXISTING CODE]
  // @Post('login')
  // @HttpCode(HttpStatus.OK)
  // async login(@Body(new ValidationPipe()) dto: LoginDto) {
  //   return this.authModuleService.loginService(dto);
  // }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ValidationPipe()) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authModuleService.loginService(dto);
    const csrfToken = crypto.randomUUID();
    this.setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken, csrfToken);

    if (result.user && result.user.profileImage) {
      try {
        result.user.profileImage = await this.s3Service.getDownloadUrl(result.user.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      csrfToken,
      user: result.user,
    };
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authModuleService.logoutService(req.user.id);
    this.clearAuthCookies(res);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Logout successful',
    };
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = this.parseCookies(req.headers.cookie);
    const refreshToken = cookies['refreshToken'];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const result = await this.authModuleService.refreshToken(refreshToken);
    const csrfToken = crypto.randomUUID();
    this.setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken, csrfToken);

    if (result.user && result.user.profileImage) {
      try {
        result.user.profileImage = await this.s3Service.getDownloadUrl(result.user.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Tokens refreshed successfully',
      csrfToken,
      user: result.user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getMe(@Req() req: any) {
    const { hashedPassword, hashedRefreshToken, tokenVersion, ...safeUser } = req.user;
    if (safeUser.profileImage) {
      try {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(safeUser.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Profile fetched successfully',
      data: safeUser,
    };
  }
}
