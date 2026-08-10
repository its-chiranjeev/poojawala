import { FileInterceptor, FileFieldsInterceptor } from "@nestjs/platform-express";
import { Body, Controller, UploadedFiles, Res, Query, Get, Put, Patch, Delete, Param, ParseIntPipe, HttpCode, HttpStatus, Post, Req, UnauthorizedException, UseGuards, UseInterceptors, ValidationPipe, UploadedFile, UnprocessableEntityException,  Logger } from "@nestjs/common";
import { UserService } from "./user.service";
import type { Response } from 'express';
import * as crypto from 'crypto';
import { AuthGuard } from "@nestjs/passport";
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from "@likemyproduct/common";
import { UpdateUserDto, UpdateUserStatusDto, RegisterNormalUserDto, GenerateOtpDto, CustomerFavoriteDto, VerifyPurohitDto, CreatePurohitByAdminDto } from "@likemyproduct/dtos";import { USER_ROLE, USER_STATUS } from '@likemyproduct/entities';
import { filter } from 'rxjs';
import { UpsertPlatformSettingDto } from "@likemyproduct/dtos/Platform setting/Platform.dto";
import { GetAllUsersDto } from "@likemyproduct/dtos/user/get-all-users.dto";
import { CreateCustomerAddressDto } from "@likemyproduct/dtos/user/add-customer-address.dto";
import { CreatePurohitServiceAreaDto } from "@likemyproduct/dtos/user/add-purohit-address.dto";
import { UpdatePurohitServiceAreaDto } from "@likemyproduct/dtos/user/update-purohit-address.dto";
import { Cron } from '@nestjs/schedule';

@Controller('users')
export class UserController {
    private readonly logger = new Logger(UserController.name);

  constructor(
    private readonly userService: UserService
  ) { }

  @Cron('0 0 */6 * * *', {
    name: 'delete-expired-otps',
    timeZone: 'Asia/Kolkata',
  })
  async deleteExpiredOtpsCron(): Promise<void> {
    this.logger.log(
      'Expired OTP cleanup cron started',
    );

    try {
      const deletedCount =
        await this.userService.deleteExpiredOtps();

      this.logger.log(
        `${deletedCount} expired OTP(s) deleted`,
      );
    } catch (error) {
      this.logger.error(
        'Expired OTP cleanup cron failed',
        error instanceof Error
          ? error.stack
          : String(error),
      );
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Patch('admin/update/:id')
  @UseInterceptors(FileInterceptor('profileImage'))
  @HttpCode(HttpStatus.OK)
  async updateProfileByAdmin(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.userService.updateProfileByAdmin(id, dto, file);
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Patch('profile')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profileImage', maxCount: 1 },
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
      certificate?: Express.Multer.File[];
      templeAffiliationProof?: Express.Multer.File[];
    },
    @Body(new ValidationPipe({ whitelist: true }))
    dto: UpdateUserDto,
  ) {
    const userId = req.user.id;

    return this.userService.updateProfileByUser(
      userId,
      dto,
      files,
    );
  }


  // cahnge user status ACTIVE,PENDING,INACTIVE,BLOCKED,REJECTED
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Patch('admin/status/:id')
  @HttpCode(HttpStatus.OK)
  async updateUserStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: UpdateUserStatusDto,
  ) {
    return this.userService.updateUserStatus(
      id,
      dto.status,
    );
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
  @Patch('platform-upsert')
  @HttpCode(HttpStatus.OK)
  async upsertPlatformSetting(
    @Req() req: Request,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: UpsertPlatformSettingDto,
  ) {
    const user = (req as any).user;

    return this.userService.upsertPlatformSetting(
      dto,
      user.id,
    );
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
    };
  }

  @Post('generate-otp')
  @HttpCode(HttpStatus.OK)
  async generateOtp(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto:  GenerateOtpDto,
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
  @Roles(USER_ROLE.ADMIN)
  getApprovedPurohits(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    return this.userService.getApprovedPurohits(
      Number(page),
      Number(limit),
      search,
    );
  }

  @Get('purohits/:id')
  @Roles(USER_ROLE.ADMIN)
  getApprovedPurohitById(
    @Param('id', ParseIntPipe) id: number,
  ) {
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
    return this.userService.addFavorite(
      req.user.id,
      dto,
    );
  }

  @Get('favorites')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  getMyFavorites(
    @Req() req: any,
  ) {
    return this.userService.getMyFavorites(
      req.user.id,
    );
  }

  @Delete('favorites/:purohitId')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  removeFavorite(
    @Req() req: any,
    @Param('purohitId', ParseIntPipe) purohitId: number,
  ) {
    return this.userService.removeFavorite(
      req.user.id,
      purohitId,
    );
  }

    
  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    csrfToken: string,
  ) {
    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
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


  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Get('platform-setting')
  @HttpCode(HttpStatus.OK)
  async getPlatformSetting(
    @Req() req: Request,
  ) {
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

  @UseGuards(JwtAuthGuard, CsrfGuard)
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

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Post('purohit/add-address')
  async addServiceArea(
    @Req() req: any,
    @Body() dto: CreatePurohitServiceAreaDto,
  ) {
    return this.userService.addServiceArea(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Patch('purohit/update-address/:id')
  async updateServiceArea(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurohitServiceAreaDto,
  ) {
    return this.userService.updateServiceArea(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Get('purohit/addresses')
  async getMyServiceAreas(@Req() req: any) {
    return this.userService.getMyServiceAreas(req.user.id);
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Delete('purohit/address/:id')
  async deleteServiceArea(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.userService.deleteServiceArea(req.user.id, id);
  }
}
