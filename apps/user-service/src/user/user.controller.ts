import { FileInterceptor } from "@nestjs/platform-express";
import { Body, Controller, Res, Query, Get, Put, Patch, Delete, Param, ParseIntPipe, HttpCode, HttpStatus, Post, Req, UnauthorizedException, UseGuards, UseInterceptors, ValidationPipe, UploadedFile, UnprocessableEntityException } from "@nestjs/common";
import { UserService } from "./user.service";
import type { Response } from 'express';
import * as crypto from 'crypto';
import { AuthGuard } from "@nestjs/passport";
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from "@likemyproduct/common";
import { UpdateUserDto, RegisterNormalUserDto, } from "@likemyproduct/dtos";
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

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async registerUser(
    @Body(new ValidationPipe({ whitelist: true }))
    dto: RegisterNormalUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.userService.registerUser(dto);

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
    @Body('email') email: string,
    @Body('role') role: USER_ROLE,
  ) {
    return this.userService.generateOtp(email, role);
  }
  
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body('email') email: string,
    @Body('otp') otp: string,
  ) {
    return this.userService.verifyOtp(email, otp);
  }
  @Patch(':id/status')
  @Roles(USER_ROLE.ADMIN)
  updatePurohitStatus(
    @Param('id') id: string,
    @Body('status') status: USER_STATUS,
  ) {
    return this.userService.updatePurohitStatus(id, status);
  }
  @Get('purohits')
  @Roles(USER_ROLE.ADMIN)
  getApprovedPurohits() {
    return this.userService.getApprovedPurohits();
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
}

