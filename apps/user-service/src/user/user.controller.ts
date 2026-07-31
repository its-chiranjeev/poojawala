import { FileInterceptor } from "@nestjs/platform-express";
import { Body, Controller, Query, Get, Put, Patch, Delete, Param, ParseIntPipe, HttpCode, HttpStatus, Post, Req, UnauthorizedException, UseGuards, UseInterceptors, ValidationPipe, UploadedFile, UnprocessableEntityException, Logger } from "@nestjs/common";
import { UserService } from "./user.service";
import { AuthGuard } from "@nestjs/passport";
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from "@likemyproduct/common";
import { UpdateUserDto , VerifyPurohitDto } from "@likemyproduct/dtos";
import { USER_ROLE, USER_STATUS } from '@likemyproduct/entities';
import { filter } from 'rxjs';
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
  @Patch('purohits/:id/verification')
  @HttpCode(HttpStatus.OK)
  async verifyPurohitByAdmin(
    @Req() req: any,
    @Param('id', ParseIntPipe) purohitUserId: number,
    @Body(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }))
    dto: VerifyPurohitDto,
  ) {
    return this.userService.verifyPurohitByAdmin(
      req.user.id,
      purohitUserId,
      dto,
    );
  }
}

