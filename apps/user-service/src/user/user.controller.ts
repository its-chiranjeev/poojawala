import { FileInterceptor, FileFieldsInterceptor } from "@nestjs/platform-express";
import { Body, Controller, UploadedFiles, Res, Query, Get, Put, Patch, Delete, Param, ParseIntPipe, HttpCode, HttpStatus, Post, Req, UnauthorizedException, UseGuards, UseInterceptors, ValidationPipe, UploadedFile, UnprocessableEntityException } from "@nestjs/common";
import { UserService } from "./user.service";
import type { Response } from 'express';
import * as crypto from 'crypto';
import { AuthGuard } from "@nestjs/passport";
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from "@likemyproduct/common";
import { UpdateUserDto, RegisterNormalUserDto, GenerateOtpDto, CustomerFavoriteDto,} from "@likemyproduct/dtos";
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
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'aadhaarDoc', maxCount: 1 },
      { name: 'panDoc', maxCount: 1 },
      { name: 'certificate', maxCount: 1 },
      { name: 'templeAffiliationProof', maxCount: 1 },
    ]),
  )
  async registerUser(
    @UploadedFiles()
    files: {
      aadhaarDoc?: Express.Multer.File[];
      panDoc?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
      templeAffiliationProof?: Express.Multer.File[];
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
}

