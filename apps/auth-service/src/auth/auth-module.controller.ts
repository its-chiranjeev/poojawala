import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  Res,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthModuleService } from './auth-module.service';
import {
  JwtAuthGuard,
  CsrfGuard,
  ROLE_COOKIE_MAP,
  setRoleAuthCookies,
  clearRoleAuthCookies,
  clearAllAuthCookies,
  parseCookieHeader,
  getRoleCsrfPropertyName,
} from '@poojawala/common';
import {
  LoginDto,
  VerifyOtpDto,
  RegisterSuperAdminDto,
  RegisterNormalUserDto,
  OtpDto,
  RegisterUserDto,
  resetPasswordDto,
  forgotPasswordDto,
  ResendOtpDto,
  GoogleAuthDto,
  SwitchIntentDto,
} from '@poojawala/dtos';
import { USER_ROLE } from '@poojawala/entities';
import type { Response } from 'express';
import * as crypto from 'crypto';
import { S3Service } from '@poojawala/s3';

export interface RoleAuthActionDto {
  role?: string;
  refreshToken?: string;
  csrfToken?: string;
  poojawalaCustomerCsrfToken?: string;
  poojawalaAdminCsrfToken?: string;
  poojawalaPurohitCsrfToken?: string;
  [key: string]: any;
}

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

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    csrfToken: string,
    role: USER_ROLE,
  ) {
    setRoleAuthCookies(res, { accessToken, refreshToken, csrfToken }, role);

    // TODO: Legacy generic auth cookie logic retained for reference.
    // Role-based cookies are now authoritative.
    /*
    const isProd = process.env.NODE_ENV === 'production';
    const req = (res as any).req;
    const origin = req?.headers?.origin;
    const isCrossSite = origin && (origin.includes('192.168.') || origin.includes('10.') || origin.includes('172.') || origin.includes('localhost') || origin.includes('127.0.0.1'));
    const sameSite = (isCrossSite || !isProd) ? 'none' : 'lax';
    const secure = true;
    const cookieOptions: any = { httpOnly: true, secure, sameSite, partitioned: Boolean(isCrossSite || !isProd), path: '/' };
    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('csrf-token', csrfToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
    */
  }

  private clearAuthCookies(res: Response, role: USER_ROLE, req?: any) {
    clearRoleAuthCookies(res, role, req || (res as any).req);

    // TODO: Legacy generic auth cookie logic retained for reference.
    // Role-based cookies are now authoritative.
    /*
    const isProd = process.env.NODE_ENV === 'production';
    const req = (res as any).req;
    const origin = req?.headers?.origin;
    const isCrossSite = origin && (origin.includes('192.168.') || origin.includes('10.') || origin.includes('172.') || origin.includes('localhost') || origin.includes('127.0.0.1'));
    const sameSite = (isCrossSite || !isProd) ? 'none' : 'lax';
    const secure = true;
    const cookieOptions: any = { httpOnly: true, secure, sameSite, partitioned: Boolean(isCrossSite || !isProd), path: '/' };
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
    res.clearCookie('csrf-token', cookieOptions);
    */
  }

  private parseCookies(cookieHeader?: string): Record<string, string> {
    return parseCookieHeader(cookieHeader);
  }

  private decodeJwtPayload(token: string): any | null {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      }
    } catch {
      // ignore
    }
    return null;
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
    this.setAuthCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
      csrfToken,
      USER_ROLE.ADMIN,
    );

    // TODO: VERCEL_BLOB_MIGRATION
    // Legacy S3 signed URL generation retained for rollback/reference.
    /*
    if (result.user && result.user.profileImage) {
      try {
        result.user.profileImage = await this.s3Service.getDownloadUrl(result.user.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }
    */
    // Active Vercel Blob implementation:
    // Stored public Blob URLs or existing URLs are returned directly without S3 signed URL.

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: result.message,
      poojawalaAdminCsrfToken: csrfToken,
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
    this.setAuthCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
      csrfToken,
      result.user.role as USER_ROLE,
    );

    // TODO: VERCEL_BLOB_MIGRATION
    // Legacy S3 signed URL generation retained for rollback/reference.
    /*
    if (result.user && result.user.profileImage) {
      try {
        result.user.profileImage = await this.s3Service.getDownloadUrl(result.user.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }
    */
    // Active Vercel Blob implementation:
    // Stored public Blob URLs or existing URLs are returned directly without S3 signed URL.

    const roleCsrfKey = getRoleCsrfPropertyName(result.user.role);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      ...(roleCsrfKey ? { [roleCsrfKey]: csrfToken } : { csrfToken }),
      user: result.user,
    };
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Body() body?: RoleAuthActionDto,
  ) {
    const cookies = req?.cookies || this.parseCookies(req?.headers?.cookie);

    // 1. Extract incoming CSRF token from header, body, or query
    const incomingCsrf = (
      req?.headers?.['x-csrf-token'] ||
      req?.headers?.['x-csrf'] ||
      body?.csrfToken ||
      req?.body?.csrfToken ||
      (body as any)?.poojawalaCustomerCsrfToken ||
      (body as any)?.poojawalaAdminCsrfToken ||
      (body as any)?.poojawalaPurohitCsrfToken ||
      req?.query?.csrfToken
    )?.toString().trim();

    // 2. Match incoming CSRF token against the cookies present in the request
    let csrfRoleMatch: USER_ROLE | undefined;
    if (incomingCsrf) {
      for (const role of [USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT]) {
        const cookieNames = ROLE_COOKIE_MAP[role];
        const roleCookieCsrf =
          cookies[cookieNames.csrf] || cookies[cookieNames.csrfCamel];
        if (roleCookieCsrf && roleCookieCsrf.trim() === incomingCsrf) {
          csrfRoleMatch = role;
          break;
        }
      }
    }

    // 3. Fallback to explicit role hint if provided (body.role, header x-auth-role, query ?role)
    const roleHint = (
      body?.role ||
      req?.body?.role ||
      req?.headers?.['x-auth-role'] ||
      req?.headers?.['x-role'] ||
      req?.query?.role
    )?.toString().toUpperCase();

    const validRoles = [USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT];
    const explicitRole = validRoles.includes(roleHint as USER_ROLE) ? (roleHint as USER_ROLE) : undefined;

    // 4. Resolve the target role to log out:
    // Priority: CSRF token match > Explicit role hint > Authenticated user role > Single present cookie role
    let targetRole: USER_ROLE | undefined = csrfRoleMatch || explicitRole || (req?.user?.role as USER_ROLE);

    if (!targetRole && !roleHint) {
      const presentRoles = validRoles.filter((role) => {
        const names = ROLE_COOKIE_MAP[role];
        return Boolean(cookies[names.access] || cookies[names.refresh] || cookies[names.csrf]);
      });
      if (presentRoles.length === 1) {
        targetRole = presentRoles[0];
      }
    }

    // 5. Invalidate refresh token in database for the targeted user
    try {
      if (targetRole && req?.user?.role === targetRole && req?.user?.id) {
        await this.authModuleService.logoutService(req.user.id);
      } else if (targetRole) {
        const targetCookieNames = ROLE_COOKIE_MAP[targetRole];
        const targetRefreshToken = cookies[targetCookieNames.refresh];
        if (targetRefreshToken) {
          const decoded = this.decodeJwtPayload(targetRefreshToken);
          if (decoded?.sub) {
            await this.authModuleService.logoutService(decoded.sub);
          }
        } else if (req?.user?.id) {
          await this.authModuleService.logoutService(req.user.id);
        }
      } else if (req?.user?.id) {
        await this.authModuleService.logoutService(req.user.id);
      }
    } catch {
      // Invalidation error should not prevent cookie clearing
    }

    // 6. Clear cookies: strictly clear ONLY the matched role's cookies
    if (roleHint === 'ALL') {
      this.clearAuthCookies(res, USER_ROLE.ADMIN, req);
      this.clearAuthCookies(res, USER_ROLE.CUSTOMER, req);
      this.clearAuthCookies(res, USER_ROLE.PUROHIT, req);
    } else if (targetRole) {
      this.clearAuthCookies(res, targetRole, req);
    } else {
      // If ambiguous, clear only roles whose cookies are actually present in the request
      for (const role of validRoles) {
        const names = ROLE_COOKIE_MAP[role];
        if (cookies[names.access] || cookies[names.refresh] || cookies[names.csrf]) {
          this.clearAuthCookies(res, role, req);
        }
      }
    }

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
    @Body() body?: RoleAuthActionDto,
  ) {
    const cookies = req?.cookies || this.parseCookies(req.headers.cookie);

    // TODO: Legacy generic auth cookie logic retained for reference.
    // Role-based cookies are now authoritative.
    // const refreshToken = cookies['refreshToken'];

    const adminToken = cookies[ROLE_COOKIE_MAP[USER_ROLE.ADMIN].refresh];
    const customerToken = cookies[ROLE_COOKIE_MAP[USER_ROLE.CUSTOMER].refresh];
    const purohitToken = cookies[ROLE_COOKIE_MAP[USER_ROLE.PUROHIT].refresh];

    const presentRefresh: { role: USER_ROLE; token: string; cookieName: string }[] = [];
    if (adminToken) {
      presentRefresh.push({
        role: USER_ROLE.ADMIN,
        token: adminToken,
        cookieName: ROLE_COOKIE_MAP[USER_ROLE.ADMIN].refresh,
      });
    }
    if (customerToken) {
      presentRefresh.push({
        role: USER_ROLE.CUSTOMER,
        token: customerToken,
        cookieName: ROLE_COOKIE_MAP[USER_ROLE.CUSTOMER].refresh,
      });
    }
    if (purohitToken) {
      presentRefresh.push({
        role: USER_ROLE.PUROHIT,
        token: purohitToken,
        cookieName: ROLE_COOKIE_MAP[USER_ROLE.PUROHIT].refresh,
      });
    }

    const directBodyToken = req.body?.refreshToken;
    if (directBodyToken) {
      const decoded = this.decodeJwtPayload(directBodyToken);
      const role =
        (decoded?.role as USER_ROLE) ||
        (req.body?.role as USER_ROLE) ||
        USER_ROLE.CUSTOMER;
      const existing = presentRefresh.find((p) => p.role === role);
      if (existing) {
        existing.token = directBodyToken;
      } else {
        presentRefresh.push({
          role,
          token: directBodyToken,
          cookieName: ROLE_COOKIE_MAP[role]?.refresh || 'refreshToken',
        });
      }
    }

    if (presentRefresh.length === 0) {
      throw new UnauthorizedException('Refresh token missing');
    }

    // If a specific role is explicitly requested via body or query, honor it;
    // otherwise refresh tokens for ALL roles present in the request.
    const explicitRole = (req.body?.role || req.query?.role)?.toString().toUpperCase();
    const validRoles = [USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT];
    const targetRole = validRoles.find((r) => r === explicitRole);

    const rolesToRefresh = targetRole
      ? presentRefresh.filter((item) => item.role === targetRole)
      : [...presentRefresh];

    if (rolesToRefresh.length === 0) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const refreshedCsrfMap: Record<string, string> = {};
    const refreshedUsers: Record<string, any> = {};
    let primaryUser: any;
    let anySucceeded = false;
    let lastError: any;

    for (const item of rolesToRefresh) {
      try {
        const result = await this.authModuleService.refreshToken(item.token, item.role);
        const csrfToken = crypto.randomUUID();
        this.setAuthCookies(
          res,
          result.tokens.accessToken,
          result.tokens.refreshToken,
          csrfToken,
          item.role,
        );

        const roleCsrfKey = getRoleCsrfPropertyName(item.role);
        if (roleCsrfKey) {
          refreshedCsrfMap[roleCsrfKey] = csrfToken;
        }

        refreshedUsers[item.role] = result.user;
        primaryUser = result.user;
        anySucceeded = true;
      } catch (err) {
        lastError = err;
      }
    }

    if (!anySucceeded) {
      throw lastError || new UnauthorizedException('Invalid or expired refresh token');
    }

    // Check if an incoming CSRF token identifies a specific dashboard role
    const incomingCsrf = (
      req.headers?.['x-csrf-token'] ||
      req.headers?.['x-csrf'] ||
      body?.csrfToken ||
      req.body?.csrfToken ||
      body?.poojawalaCustomerCsrfToken ||
      body?.poojawalaAdminCsrfToken ||
      body?.poojawalaPurohitCsrfToken ||
      req.query?.csrfToken
    )?.toString().trim();

    let matchedRole: USER_ROLE | undefined;
    if (incomingCsrf) {
      for (const item of presentRefresh) {
        const cookieNames = ROLE_COOKIE_MAP[item.role];
        const roleCookieCsrf =
          cookies[cookieNames.csrf] || cookies[cookieNames.csrfCamel];
        if (roleCookieCsrf && roleCookieCsrf === incomingCsrf) {
          matchedRole = item.role;
          break;
        }
      }
    }

    const preferredRole = matchedRole || targetRole;
    if (preferredRole && refreshedUsers[preferredRole]) {
      primaryUser = refreshedUsers[preferredRole];
    }

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Tokens refreshed successfully',
      ...refreshedCsrfMap,
      // user: primaryUser,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getMe(@Req() req: any) {
    const safeUser = await this.authModuleService.getFullProfile(req.user.id, req.user.role);
    // TODO: VERCEL_BLOB_MIGRATION
    // Legacy S3 signed URL generation retained for rollback/reference.
    /*
    if (safeUser.profileImage) {
      try {
        safeUser.profileImage = await this.s3Service.getDownloadUrl(safeUser.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }
    */
    // Active Vercel Blob implementation:
    // Stored public Blob URLs or existing URLs are returned directly without S3 signed URL.

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

    const purohitServices = (safeUser as any).purohitServices;
    if (Array.isArray(purohitServices)) {
      for (const ps of purohitServices) {
        const service = ps.service;
        if (service) {
          let plans = service.plans;
          if (typeof plans === 'string') {
            try {
              plans = JSON.parse(plans);
            } catch { }
          }
          let basePrice = 0;
          if (plans?.basic?.price != null && Number(plans.basic.price) > 0) {
            basePrice = Number(plans.basic.price);
          } else if (
            service.priceWithoutSamagri != null &&
            Number(service.priceWithoutSamagri) > 0
          ) {
            basePrice = Number(service.priceWithoutSamagri);
          }

          if (basePrice > 0) {
            const commissionPercentage = Number(
              service.commissionPercentage != null
                ? service.commissionPercentage
                : 10,
            );
            const platformCommission = Number(
              ((basePrice * commissionPercentage) / 100).toFixed(2),
            );
            const payout = Number((basePrice - platformCommission).toFixed(2));
            ps.purohitPayoutAmount = payout;
            service.purohitPayoutAmount = payout;
          } else {
            ps.purohitPayoutAmount = null;
            service.purohitPayoutAmount = null;
          }
        }
      }
      if ((safeUser as any).profile && !(safeUser as any).profile.purohitServices) {
        (safeUser as any).profile.purohitServices = purohitServices;
      }
    }

    // Resolve state for user profile
    let userState: string | null = (safeUser as any)?.state || null;
    if (!userState) {
      if (req.user?.role === USER_ROLE.PUROHIT || (safeUser as any)?.role === USER_ROLE.PUROHIT) {
        const serviceAreas = (safeUser as any).serviceAreas;
        if (serviceAreas && serviceAreas.length > 0) {
          const defaultArea = serviceAreas.find((a: any) => a.isDefault) || serviceAreas[0];
          userState = defaultArea?.state || null;
        }
        if (!userState && (safeUser as any).profile?.state) {
          userState = (safeUser as any).profile.state;
        }
        if (!userState) {
          const addresses = (safeUser as any).addresses;
          if (addresses && addresses.length > 0) {
            const defaultAddress = addresses.find((a: any) => a.isDefault) || addresses[0];
            userState = defaultAddress?.state || null;
          }
        }
      } else {
        const addresses = (safeUser as any).addresses;
        if (addresses && addresses.length > 0) {
          const defaultAddress = addresses.find((a: any) => a.isDefault) || addresses[0];
          userState = defaultAddress?.state || null;
        }
        if (!userState) {
          const serviceAreas = (safeUser as any).serviceAreas;
          if (serviceAreas && serviceAreas.length > 0) {
            const defaultArea = serviceAreas.find((a: any) => a.isDefault) || serviceAreas[0];
            userState = defaultArea?.state || null;
          }
        }
        if (!userState && (safeUser as any).profile?.state) {
          userState = (safeUser as any).profile.state;
        }
      }
    }

    (safeUser as any).state = userState;
    if ((safeUser as any).profile) {
      (safeUser as any).profile.state = (safeUser as any).profile.state || userState;
      (safeUser as any).verificationStatus = (safeUser as any).profile.verificationStatus;
      (safeUser as any).rejectionReason = (safeUser as any).profile.rejectionReason ?? null;
    }

    if (Array.isArray((safeUser as any).addresses)) {
      (safeUser as any).addresses = (safeUser as any).addresses
        .filter((a: any) => !a.deletedAt)
        .sort((a: any, b: any) => {
          const aDefault = a.isDefault ? 1 : 0;
          const bDefault = b.isDefault ? 1 : 0;
          if (aDefault !== bDefault) return bDefault - aDefault;
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });
    }
    if (Array.isArray((safeUser as any).serviceAreas)) {
      (safeUser as any).serviceAreas = (safeUser as any).serviceAreas
        .filter((a: any) => !a.deletedAt)
        .sort((a: any, b: any) => {
          const aDefault = a.isDefault ? 1 : 0;
          const bDefault = b.isDefault ? 1 : 0;
          if (aDefault !== bDefault) return bDefault - aDefault;
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });
    }
    if (Array.isArray((safeUser as any).bankAccounts)) {
      (safeUser as any).bankAccounts = (safeUser as any).bankAccounts
        .filter((a: any) => !a.deletedAt)
        .sort((a: any, b: any) => {
          const aPrimary = a.isPrimary ? 1 : 0;
          const bPrimary = b.isPrimary ? 1 : 0;
          if (aPrimary !== bPrimary) return bPrimary - aPrimary;
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });
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

  @Get('google')
  async googleAuth(
    @Query('role') roleParam: string,
    @Res() res: Response,
  ) {
    const { url, state } = this.authModuleService.getGoogleOAuthRedirect(roleParam);

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('google_oauth_state', state, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/',
    });

    return res.redirect(url);
  }

  @Get('google/callback')
  async googleAuthCallback(
    @Req() req: any,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    const frontendUrl = this.authModuleService.getFrontendUrl();

    if (error) {
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent('Missing authorization code or state')}`,
      );
    }

    const cookies = this.parseCookies(req.headers.cookie);
    const savedState = cookies['google_oauth_state'];

    if (!savedState || savedState !== state) {
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent('Invalid or expired OAuth state')}`,
      );
    }

    res.clearCookie('google_oauth_state', { path: '/' });

    try {
      const { result, redirectUrl, csrfToken } =
        await this.authModuleService.processGoogleOAuthCallback(code, state);

      this.setAuthCookies(
        res,
        result.tokens.accessToken,
        result.tokens.refreshToken,
        csrfToken,
        result.user.role as USER_ROLE,
      );
      return res.redirect(redirectUrl);
    } catch (err: any) {
      const message = err.message || 'Google authentication failed';
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(message)}`);
    }
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleAuthDirect(
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: GoogleAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (dto.role === USER_ROLE.ADMIN) {
      throw new BadRequestException('ADMIN role is not allowed for Google authentication');
    }

    let identity;
    if (dto.credential) {
      identity = await this.authModuleService.verifyGoogleToken(dto.credential);
    } else if (dto.code) {
      identity = await this.authModuleService.exchangeGoogleCode(dto.code);
    } else {
      throw new BadRequestException('Either credential (ID token) or code must be provided');
    }

    const result = await this.authModuleService.handleGoogleAuth(identity, dto.role);
    const csrfToken = crypto.randomUUID();
    this.setAuthCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
      csrfToken,
      result.user.role as USER_ROLE,
    );

    // TODO: VERCEL_BLOB_MIGRATION
    // Legacy S3 signed URL generation retained for rollback/reference.
    /*
    if (result.user && result.user.profileImage) {
      try {
        result.user.profileImage = await this.s3Service.getDownloadUrl(result.user.profileImage);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for profileImage:', e);
      }
    }
    */
    // Active Vercel Blob implementation:
    // Stored public Blob URLs or existing URLs are returned directly without S3 signed URL.

    const roleCsrfKey = getRoleCsrfPropertyName(result.user.role);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      ...(roleCsrfKey ? { [roleCsrfKey]: csrfToken } : { csrfToken }),
      user: result.user,
      isNewUser: result.isNewUser,
    };
  }

  // @UseGuards(JwtAuthGuard, CsrfGuard)
  // @Post('intent')
  // @HttpCode(HttpStatus.OK)
  // async switchIntent(
  //   @Req() req: any,
  //   @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: SwitchIntentDto,
  //   @Res({ passthrough: true }) res: Response,
  // ) {
  //   const result = await this.authModuleService.switchIntentService(req.user.id, dto);
  //   const csrfToken = crypto.randomUUID();
  //   this.setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken, csrfToken);

  //   if (result.user && result.user.profileImage) {
  //     try {
  //       result.user.profileImage = await this.s3Service.getDownloadUrl(result.user.profileImage);
  //     } catch (e) {
  //       console.error('Failed to generate pre-signed URL for profileImage:', e);
  //     }
  //   }

  //   return {
  //     success: true,
  //     statusCode: HttpStatus.OK,
  //     message: result.message,
  //     csrfToken,
  //     user: result.user,
  //   };
  // }
}
