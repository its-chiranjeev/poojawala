import { FileInterceptor } from "@nestjs/platform-express";
import { Body, Controller, Query, Get, Put, Patch, Delete, Param, ParseIntPipe, HttpCode, HttpStatus, Post, Req, UnauthorizedException, UseGuards, UseInterceptors, ValidationPipe, UploadedFile, UnprocessableEntityException, Logger } from "@nestjs/common";
import { UserService } from "./user.service";
import { AuthGuard } from "@nestjs/passport";
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from "@likemyproduct/common";
import { UpdateUserDto , VerifyPurohitDto } from "@likemyproduct/dtos";
import { USER_ROLE, USER_STATUS } from '@likemyproduct/entities';
import { filter } from 'rxjs';
import { UpsertPlatformSettingDto } from "@likemyproduct/dtos/Platform setting/Platform.dto";
import { GetAllUsersDto } from "@likemyproduct/dtos/user/get-all-users.dto";
import { CreateCustomerAddressDto } from "@likemyproduct/dtos/user/add-customer-address.dto";
import { CreatePurohitServiceAreaDto } from "@likemyproduct/dtos/user/add-prohit-address.dto";
import { UpdatePurohitServiceAreaDto } from "@likemyproduct/dtos/user/update-progit-address.dto";
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
  @UseInterceptors(FileInterceptor('profileImage'))
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() req: any,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = req.user.id;
    return this.userService.updateProfileByUser(userId, dto, file);
  }


  // Block the user by admin
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @Patch('admin/block/:id')
  @HttpCode(HttpStatus.OK)
  async blockUser(
    @Param('id') id: number,
  ) {
    return this.userService.blockUser(id);
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
