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
import { JwtAuthGuard, CsrfGuard } from '@poojawala/common';
import { LoginDto, VerifyOtpDto, RegisterSuperAdminDto, RegisterNormalUserDto, OtpDto, RegisterUserDto ,resetPasswordDto,forgotPasswordDto} from '@poojawala/dtos';
import type { Response } from 'express';
import * as crypto from 'crypto';
import { S3Service } from '@poojawala/s3';
import { ResendOtpDto } from '@poojawala/dtos';

@Controller('auth')
export class AuthModuleController {
  constructor(
    private readonly authModuleService: AuthModuleService,
    private readonly s3Service: S3Service,
  ) { }

  // @Post('generate-otp')
  // @HttpCode(HttpStatus.OK)
  // async generateOtp(
  //   @Body(new ValidationPipe({ whitelist: true, transform: true }))
  //   dto: RegisterUserDto,
  // ) {
  //   return this.authModuleService.generateOtpService(dto);
  // }

  // @Post('verify-otp')
  // @HttpCode(HttpStatus.OK)
  // async verifyOtp(
  //   @Body(new ValidationPipe({ whitelist: true, transform: true }))
  //   dto: VerifyOtpDto,
  // ) {
  //   return this.authModuleService.verifyOtpService(dto);
  // }

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

  // [EXISTING CODE]
  // @Post('register-user')
  // @HttpCode(HttpStatus.CREATED)
  // async registerUser(@Body(new ValidationPipe()) dto: RegisterNormalUserDto) {
  //   return this.authModuleService.registerUserService(dto);
  // }

 /* @Post('register-user')
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
  }*/

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
    const safeUser = await this.authModuleService.getFullProfile(req.user.id, req.user.role);
    if (safeUser.profileImage) {
      try {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(safeUser.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }

    if ((safeUser as any).profile) {
      const profile = { ...(safeUser as any).profile };
      try {
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

        // Attach serviceRadiusKm from the default service area (or first available)
        const serviceAreas = (safeUser as any).serviceAreas;
        if (serviceAreas && serviceAreas.length > 0) {
          const defaultArea = serviceAreas.find((a: any) => a.isDefault) || serviceAreas[0];
          profile.serviceRadiusKm = defaultArea.serviceRadiusKm;
        }

        (safeUser as any).profile = profile;
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profile documents:', e);
      }
    }
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Profile fetched successfully',
      data: safeUser,
    };
  }


  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: forgotPasswordDto,
  ) {
    return this.authModuleService.forgotPasswordService(dto);
  }

  @Patch('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: resetPasswordDto,
  ) {
    return this.authModuleService.resetPasswordService(dto);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: ResendOtpDto,
  ) {
    return this.authModuleService.resendOtpService(dto);
  }
}
