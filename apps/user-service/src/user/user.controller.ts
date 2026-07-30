import { FileInterceptor } from "@nestjs/platform-express";
import { Body, Controller, Query, Get, Put, Patch, Delete, Param, ParseIntPipe, HttpCode, HttpStatus, Post, Req, UnauthorizedException, UseGuards, UseInterceptors, ValidationPipe, UploadedFile, UnprocessableEntityException } from "@nestjs/common";
import { UserService } from "./user.service";
import { AuthGuard } from "@nestjs/passport";
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from "@likemyproduct/common";
import { UpdateUserDto , VerifyPurohitDto } from "@likemyproduct/dtos";
import { USER_ROLE, USER_STATUS } from '@likemyproduct/entities';
import { filter } from 'rxjs';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) { }

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

