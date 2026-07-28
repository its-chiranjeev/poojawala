import { FileInterceptor } from "@nestjs/platform-express";
import { Body, Controller, Query, Get, Put, Patch, Delete, Param, ParseIntPipe, HttpCode, HttpStatus, Post, Req, UnauthorizedException, UseGuards, UseInterceptors, ValidationPipe, UploadedFile, UnprocessableEntityException } from "@nestjs/common";
import { UserService } from "./user.service";
import { AuthGuard } from "@nestjs/passport";
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from "@likemyproduct/common";
import { UpdateUserDto } from "@likemyproduct/dtos";
import { USER_ROLE, USER_STATUS } from '@likemyproduct/entities';
import { filter } from 'rxjs';
import { GetAllUsersDto } from "@likemyproduct/dtos/user/get-all-users.dto";
import { CreateCustomerAddressDto } from "@likemyproduct/dtos/user/add-customer-address.dto";

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
}
