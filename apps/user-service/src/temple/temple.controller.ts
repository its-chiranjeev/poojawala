import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  JwtAuthGuard,
  OptionalJwtAuthGuard,
  RolesGuard,
  Roles,
} from '@poojawala/common';
import { USER_ROLE, User } from '@poojawala/entities';
import {
  CreateTempleDto,
  UpdateTempleDto,
  GetTemplesQueryDto,
} from '@poojawala/dtos';
import { TempleService } from './temple.service';

interface AuthenticatedRequest extends Request {
  user: User;
}

interface OptionalAuthRequest extends Request {
  user?: User;
}

@Controller('temples')
export class TempleController {
  constructor(private readonly templeService: TempleService) { }

  // ─── ADMIN WRITE ENDPOINTS ──────────────────────────────────────────────────

  @Post('add')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'imageUrl', maxCount: 1 },
    ]),
  )
  @HttpCode(HttpStatus.CREATED)
  async createTemple(
    @Req() req: AuthenticatedRequest,
    @Body(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
    dto: CreateTempleDto,
    @UploadedFiles()
    files?: {
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
    },
  ) {
    return this.templeService.createTemple(dto, files, req.user?.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'imageUrl', maxCount: 1 },
    ]),
  )
  @HttpCode(HttpStatus.OK)
  async updateTemple(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
    dto: UpdateTempleDto,
    @UploadedFiles()
    files?: {
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
    },
  ) {
    return this.templeService.updateTemple(id, dto, files, req.user?.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteTemple(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.templeService.deleteTemple(id, req.user?.id);
  }

  // ─── SHARED READ ENDPOINTS (ADMIN & PUBLIC) ─────────────────────────────────

  @Get('all')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getTemples(
    @Req() req: OptionalAuthRequest,
    @Query() query: GetTemplesQueryDto,
  ) {
    const isAdmin = req.user?.role === USER_ROLE.ADMIN;
    return this.templeService.getTemples(query, isAdmin);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getTempleById(
    @Req() req: OptionalAuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const isAdmin = req.user?.role === USER_ROLE.ADMIN;
    return this.templeService.getTempleById(id, isAdmin);
  }
}
