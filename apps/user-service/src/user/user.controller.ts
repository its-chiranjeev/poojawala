import {
  FileInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import {
  Body,
  Controller,
  UploadedFiles,
  Res,
  Query,
  Get,
  Put,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
  UploadedFile,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { UserService } from './user.service';
import type { Response } from 'express';
import * as crypto from 'crypto';
import {
  CreatePurohitBankAccountDto,
  UpdatePurohitBankAccountDto,
  NotificationQueryDto,
  CreateCustomerByAdminDto,
} from '@poojawala/dtos';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from '@poojawala/common';
import {
  UpdateUserDto,
  UpdateUserStatusDto,
  RegisterNormalUserDto,
  GenerateOtpDto,
  CustomerFavoriteDto,
  VerifyPurohitDto,
  CreatePurohitByAdminDto,
} from '@poojawala/dtos';
import { USER_ROLE, USER_STATUS } from '@poojawala/entities';
import { filter } from 'rxjs';
import { UpsertPlatformSettingDto } from '@poojawala/dtos/Platform setting/Platform.dto';
import { GetAllUsersDto } from '@poojawala/dtos/user/get-all-users.dto';
import { CreateCustomerAddressDto } from '@poojawala/dtos/user/add-customer-address.dto';
import { UpdateCustomerAddressDto } from '@poojawala/dtos/user/update-customer-address.dto';
import { CreatePurohitServiceAreaDto } from '@poojawala/dtos/user/add-purohit-address.dto';
import { UpdatePurohitServiceAreaDto } from '@poojawala/dtos/user/update-purohit-address.dto';
import { Cron } from '@nestjs/schedule';
import { NotificationService } from '@poojawala/notification';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class InternalEmitNotificationDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rooms?: string[];

  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  payload?: unknown;
}

@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
  ) { }

  @Post('internal/emit-notification')
  @HttpCode(HttpStatus.OK)
  async internalEmitNotification(@Body() dto: InternalEmitNotificationDto) {
    if (dto.rooms?.length && dto.event) {
      const gateway = this.notificationService.getGateway();
      if (gateway?.server) {
        gateway.server.to(dto.rooms).emit(dto.event, dto.payload);
      }
    }
    return { success: true };
  }

  @Cron('0 0 */6 * * *', {
    name: 'delete-expired-otps',
    timeZone: 'Asia/Kolkata',
  })
  async deleteExpiredOtpsCron(): Promise<void> {
    this.logger.log('Expired OTP cleanup cron started');

    try {
      const deletedCount = await this.userService.deleteExpiredOtps();

      this.logger.log(`${deletedCount} expired OTP(s) deleted`);
    } catch (error) {
      this.logger.error(
        'Expired OTP cleanup cron failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // @Cron('*/30 * * * * *', {
  //   name: 'scramble-phone-numbers',
  // })
  // async handlePhoneScramblerCron(): Promise<void> {
  //   if (process.env['NODE_ENV'] === 'production') {
  //     return;
  //   }

  //   try {
  //     await this.userService.scramblePhoneNumbers();
  //   } catch (error) {
  //     this.logger.error(
  //       'Phone scrambler cron failed',
  //       error instanceof Error ? error.stack : String(error),
  //     );
  //   }
  // }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Patch('admin/update/:id')
  @UseInterceptors(FileInterceptor('profileImage'))
  @HttpCode(HttpStatus.OK)
  async updateProfileByAdmin(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false })) dto: UpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.userService.updateProfileByAdmin(req.user.id, id, dto, file);
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Patch('profile')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profileImage', maxCount: 1 },
      { name: 'aadhaarDoc', maxCount: 1 },
      { name: 'panDoc', maxCount: 1 },
      { name: 'certificate', maxCount: 1 },
      { name: 'templeAffiliationProof', maxCount: 1 },
    ]),
  )
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() req: any,
    @UploadedFiles()
    files: {
      profileImage?: Express.Multer.File[];
      aadhaarDoc?: Express.Multer.File[];
      panDoc?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
      templeAffiliationProof?: Express.Multer.File[];
    },
    @Body(new ValidationPipe({ whitelist: true }))
    dto: UpdateUserDto,
  ) {
    const userId = req.user.id;

    return this.userService.updateProfileByUser(userId, dto, files);
  }

  // change user status ACTIVE,PENDING,INACTIVE,BLOCKED,REJECTED
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Patch('admin/status/:id')
  @HttpCode(HttpStatus.OK)
  async updateUserStatus(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: UpdateUserStatusDto,
  ) {
    return this.userService.updateUserStatus(id, dto.status, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Post('admin/add-purohit')
  @HttpCode(HttpStatus.CREATED)
  async addPurohitByAdmin(
    @Body(new ValidationPipe({ whitelist: true }))
    dto: CreatePurohitByAdminDto,
  ) {
    return this.userService.createPurohitByAdmin(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Post('admin/create-customer')
  @HttpCode(HttpStatus.CREATED)
  async createCustomerByAdmin(
    @Body(new ValidationPipe({ whitelist: true }))
    dto: CreateCustomerByAdminDto,
  ) {
    return this.userService.createCustomerByAdmin(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Patch('platform-upsert')
  @HttpCode(HttpStatus.OK)
  async upsertPlatformSetting(
    @Req() req: Request,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: UpsertPlatformSettingDto,
  ) {
    const user = (req as any).user;

    return this.userService.upsertPlatformSetting(dto, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Patch('purohits/:id/verification')
  @HttpCode(HttpStatus.OK)
  async verifyPurohitByAdmin(
    @Req() req: any,
    @Param('id', ParseIntPipe) purohitUserId: number,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: VerifyPurohitDto,
  ) {
    return this.userService.verifyPurohitByAdmin(
      req.user.id,
      purohitUserId,
      dto,
    );
  }
  // @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  // @Roles(USER_ROLE.ADMIN)
  // @Patch('platform-upsert')
  // @HttpCode(HttpStatus.OK)
  // async upsertPlatformSetting(
  //   @Req() req: Request,
  //   @Body(new ValidationPipe({ whitelist: true }))
  //   dto: UpsertPlatformSettingDto,
  // ) {
  //   const user = (req as any).user;

  //   return this.userService.upsertPlatformSetting(dto, user.id);
  // }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'aadhaarDoc', maxCount: 1 },
      { name: 'panDoc', maxCount: 1 },
      { name: 'certificate', maxCount: 1 },
      { name: 'templeAffiliationProof', maxCount: 1 },
      { name: 'profileImage', maxCount: 1 },
    ]),
  )
  async registerUser(
    @UploadedFiles()
    files: {
      aadhaarDoc?: Express.Multer.File[];
      panDoc?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
      templeAffiliationProof?: Express.Multer.File[];
      profileImage?: Express.Multer.File[];
    },
    @Body(new ValidationPipe({ whitelist: true }))
    dto: RegisterNormalUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.userService.registerUser(dto, files);

    const csrfToken = crypto.randomUUID();

    this.setAuthCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
      csrfToken,
    );

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: result.message,
      csrfToken,
      user: result.user,
      ...(result.address && { address: result.address }),
    };
  }

  @Post('generate-otp')
  @HttpCode(HttpStatus.OK)
  async generateOtp(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: GenerateOtpDto,
  ) {
    return this.userService.generateOtp(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body('phone') phone: string,
    @Body('otp') otp: string,
    @Body('email') email?: string,
  ) {
    return this.userService.verifyOtp(phone, otp, email);
  }
  // @Patch(':id/status')
  // @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  // @Roles(USER_ROLE.ADMIN)
  // updatePurohitStatus(
  //   @Param('id') id: string,
  //   @Body('status') status: USER_STATUS,
  //   @Body('rejectionReason') rejectionReason?: string,
  // ) {
  //   return this.userService.updatePurohitStatus(
  //     id,
  //     status,
  //     rejectionReason,
  //   );
  // }
  @Get('purohits')
  // @Roles(USER_ROLE.ADMIN)
  getApprovedPurohits(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('status') status?: USER_STATUS | string,
    @Query('isActive') isActive?: string | boolean,
    @Query('isOnlineAvailable') isOnlineAvailable?: string | boolean,
    @Query('isOfflineAvailable') isOfflineAvailable?: string | boolean,
  ) {
    return this.userService.getApprovedPurohits(
      Number(page),
      Number(limit),
      search,
      status,
      isActive,
      isOnlineAvailable,
      isOfflineAvailable,
    );
  }

  @Get('purohits/:id')
  @Roles(USER_ROLE.ADMIN)
  getApprovedPurohitById(@Param('id', ParseIntPipe) id: number) {
    return this.userService.getApprovedPurohitById(id);
  }

  @Post('favorites')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.CREATED)
  addFavorite(
    @Req() req: any,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: CustomerFavoriteDto,
  ) {
    return this.userService.addFavorite(req.user.id, dto);
  }

  @Get('favorites')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  getMyFavorites(@Req() req: any) {
    return this.userService.getMyFavorites(req.user.id);
  }

  @Delete('favorites/:purohitId')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  removeFavorite(
    @Req() req: any,
    @Param('purohitId', ParseIntPipe) purohitId: number,
  ) {
    return this.userService.removeFavorite(req.user.id, purohitId);
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    csrfToken: string,
  ) {
    const isProd = process.env.NODE_ENV === 'production';
    const req = (res as any).req;
    const origin = req?.headers?.origin;
    const isCrossSite =
      origin &&
      (origin.includes('192.168.') ||
        origin.includes('10.') ||
        origin.includes('172.') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1'));

    const sameSite = isCrossSite || !isProd ? 'none' : 'lax';
    const secure = true;

    const cookieOptions: any = {
      httpOnly: true,
      secure,
      sameSite,
      partitioned: Boolean(isCrossSite || !isProd),
      path: '/',
    };

    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.cookie('csrf-token', csrfToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Get('platform-setting')
  @HttpCode(HttpStatus.OK)
  async getPlatformSetting(@Req() req: Request) {
    const user = (req as any).user;

    return this.userService.getPlatformSetting(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Delete('platform-setting/:id')
  @HttpCode(HttpStatus.OK)
  async deletePlatformSetting(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = (req as any).user;

    return this.userService.deletePlatformSetting(id, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Get('get')
  async getAllUsers(
    @Query(new ValidationPipe({ transform: true }))
    query: GetAllUsersDto,
  ) {
    return this.userService.getAllUsers(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Get('get/:id')
  @HttpCode(HttpStatus.OK)
  async getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  async addAddress(
    @Req() req: any,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: CreateCustomerAddressDto,
  ) {
    const userId = req.user.id;
    return this.userService.addAddress(userId as number, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @Get('addresses')
  async getMyAddresses(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    return this.userService.getMyAddresses(
      req.user.id,
      Number(page),
      Number(limit),
      search,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @Get('addresses/:id')
  async getAddressById(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.userService.getAddressById(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @Patch('addresses/:id')
  async updateAddress(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: UpdateCustomerAddressDto,
  ) {
    return this.userService.updateAddress(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @Delete('addresses/:id')
  async deleteAddress(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.userService.deleteAddress(req.user.id, id);
  }

  // TODO: PUROHIT_VERIFICATION_RESUBMIT
  // Resubmission is now handled through the existing Edit Profile API (PATCH /users/profile).
  // Separate resubmit endpoint POST purohit/verification/resubmit is intentionally removed.

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  @Post('purohit/service-area')
  async addServiceArea(
    @Req() req: any,
    @Body() dto: CreatePurohitServiceAreaDto,
    @Query('purohitId') purohitId?: string,
  ) {
    return this.userService.addServiceArea(
      { id: req.user.id, role: req.user.role },
      dto,
      purohitId ? Number(purohitId) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  @Patch('purohit/service-area/:id')
  async updateServiceArea(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurohitServiceAreaDto,
    @Query('purohitId') purohitId?: string,
  ) {
    return this.userService.updateServiceArea(
      { id: req.user.id, role: req.user.role },
      id,
      dto,
      purohitId ? Number(purohitId) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  @Get('purohit/service-areas')
  async getMyServiceAreas(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('state') state?: string,
    @Query('purohitId') purohitId?: string,
  ) {
    return this.userService.getMyServiceAreas(
      { id: req.user.id, role: req.user.role },
      Number(page),
      Number(limit),
      search,
      state,
      purohitId ? Number(purohitId) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  @Get('purohit/service-area/:id')
  async getServiceAreaById(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('purohitId') purohitId?: string,
  ) {
    return this.userService.getServiceAreaById(
      { id: req.user.id, role: req.user.role },
      id,
      purohitId ? Number(purohitId) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  @Delete('purohit/service-area/:id')
  async deleteServiceArea(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('purohitId') purohitId?: string,
  ) {
    return this.userService.deleteServiceArea(
      { id: req.user.id, role: req.user.role },
      id,
      purohitId ? Number(purohitId) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT)
  @Post('purohit/bank-account')
  @HttpCode(HttpStatus.CREATED)
  async addPurohitBankAccount(
    @Req() req: any,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreatePurohitBankAccountDto,
  ) {
    return this.userService.addPurohitBankAccount(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT)
  @Get('purohit/bank-accounts')
  @HttpCode(HttpStatus.OK)
  async getPurohitBankAccounts(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    return this.userService.getPurohitBankAccounts(
      req.user.id,
      Number(page),
      Number(limit),
      search,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  @Get('purohit/bank-account/:id')
  @HttpCode(HttpStatus.OK)
  async getPurohitBankAccountById(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.userService.getPurohitBankAccountById(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT)
  @Patch('purohit/bank-account/:id')
  @HttpCode(HttpStatus.OK)
  async updatePurohitBankAccount(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdatePurohitBankAccountDto,
  ) {
    return this.userService.updatePurohitBankAccount(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT)
  @Delete('purohit/bank-account/:id')
  @HttpCode(HttpStatus.OK)
  async deletePurohitBankAccount(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.userService.deletePurohitBankAccount(req.user.id, id);
  }

  @Get('purohit/dashboard-stats')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT)
  async getPurohitDashboardStats(@Req() req: any) {
    return this.userService.getPurohitDashboardStats(req.user);
  }

  @Get('customer/dashboard-stats')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  async getCustomerDashboardStats(@Req() req: any) {
    return this.userService.getCustomerDashboardStats(req.user);
  }

  @Get('admin/dashboard-stats')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  async getAdminDashboardStats(@Req() req: any) {
    return this.userService.getAdminDashboardStats(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('notifications')
  @HttpCode(HttpStatus.OK)
  async getUserNotifications(
    @Req() req: any,
    @Query() query: NotificationQueryDto,
  ) {
    const user = req.user;
    return this.notificationService.getUserNotifications(user.id, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('notifications/unread-count')
  @HttpCode(HttpStatus.OK)
  async getUnreadCount(@Req() req: any) {
    const user = req.user;
    return this.notificationService.getUnreadCount(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Req() req: any) {
    const user = req.user;
    return this.notificationService.markAllAsRead(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const user = req.user;
    return this.notificationService.markAsRead(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('notifications/:id')
  @HttpCode(HttpStatus.OK)
  async deleteNotification(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = req.user;
    return this.notificationService.deleteNotification(user.id, id);
  }
}
