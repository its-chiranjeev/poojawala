import {
  ArgumentMetadata,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  ParseIntPipe,
  Patch,
  PipeTransform,
  Post,
  Put,
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

@Injectable()
export class TempleUpdatePipe implements PipeTransform {
  private readonly validationPipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  async transform(value: unknown, metadata: ArgumentMetadata) {
    if (value === null || value === undefined) {
      return this.validationPipe.transform(value, metadata);
    }

    let parsedBody: unknown = value;

    if (Array.isArray(parsedBody)) {
      parsedBody = { aartis: parsedBody };
    } else if (typeof parsedBody === 'string') {
      const trimmed = parsedBody.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          parsedBody = { aartis: JSON.parse(trimmed) };
        } catch {
          throw new BadRequestException('Invalid JSON format for aartis');
        }
      }
    }

    if (
      parsedBody &&
      typeof parsedBody === 'object' &&
      !Array.isArray(parsedBody) &&
      'aartis' in (parsedBody as Record<string, unknown>)
    ) {
      const rawAartis = (parsedBody as Record<string, unknown>)['aartis'];
      if (typeof rawAartis === 'string') {
        const trimmed = rawAartis.trim();
        if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
          (parsedBody as Record<string, unknown>)['aartis'] = undefined;
        } else {
          try {
            (parsedBody as Record<string, unknown>)['aartis'] = JSON.parse(trimmed);
          } catch {
            throw new BadRequestException('Invalid JSON format for aartis');
          }
        }
      }
    }

    if (
      parsedBody &&
      typeof parsedBody === 'object' &&
      !Array.isArray(parsedBody) &&
      'services' in (parsedBody as Record<string, unknown>)
    ) {
      const rawServices = (parsedBody as Record<string, unknown>)['services'];
      if (typeof rawServices === 'string') {
        const trimmed = rawServices.trim();
        if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
          (parsedBody as Record<string, unknown>)['services'] = undefined;
        } else {
          try {
            (parsedBody as Record<string, unknown>)['services'] = JSON.parse(trimmed);
          } catch {
            throw new BadRequestException('Invalid JSON format for services');
          }
        }
      }
    }

    return this.validationPipe.transform(parsedBody, metadata);
  }
}

interface AuthenticatedRequest extends Request {
  user: User;
}

interface OptionalAuthRequest extends Request {
  user?: User;
}

@Controller('temples')
export class TempleController {
  constructor(private readonly templeService: TempleService) { }

  // ─── WRITE ENDPOINTS (ADMIN & PUROHIT) ──────────────────────────────────────

  @Post('add')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.PUROHIT)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'imageUrl', maxCount: 1 },
      { name: 'trustDoc', maxCount: 1 },
      { name: 'trustDocUrl', maxCount: 1 },
      { name: 'deityPhoto', maxCount: 1 },
      { name: 'deityPhotoUrl', maxCount: 1 },
    ]),
  )
  @HttpCode(HttpStatus.CREATED)
  async createTemple(
    @Req() req: AuthenticatedRequest,
    @Body(new TempleUpdatePipe())
    dto: CreateTempleDto,
    @UploadedFiles()
    files?: {
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
      trustDoc?: Express.Multer.File[];
      trustDocUrl?: Express.Multer.File[];
      deityPhoto?: Express.Multer.File[];
      deityPhotoUrl?: Express.Multer.File[];
    },
  ) {
    return this.templeService.createTempleWithUser(dto, files, req.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.PUROHIT)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'imageUrl', maxCount: 1 },
      { name: 'trustDoc', maxCount: 1 },
      { name: 'trustDocUrl', maxCount: 1 },
      { name: 'deityPhoto', maxCount: 1 },
      { name: 'deityPhotoUrl', maxCount: 1 },
    ]),
  )
  @HttpCode(HttpStatus.OK)
  async updateTemple(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new TempleUpdatePipe())
    dto: UpdateTempleDto,
    @UploadedFiles()
    files?: {
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
      trustDoc?: Express.Multer.File[];
      trustDocUrl?: Express.Multer.File[];
      deityPhoto?: Express.Multer.File[];
      deityPhotoUrl?: Express.Multer.File[];
    },
  ) {
    return this.templeService.updateTempleWithUser(id, dto, files, req.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.PUROHIT)
  @HttpCode(HttpStatus.OK)
  async deleteTemple(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.templeService.deleteTemple(id, req.user);
  }

  // ─── SHARED READ ENDPOINTS (ADMIN & PUBLIC) ─────────────────────────────────

  @Get(['all', ''])
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getTemples(
    @Req() req: OptionalAuthRequest,
    @Query() query: GetTemplesQueryDto,
  ) {
    // TODO: Replaced boolean isAdmin parameter with req.user so that role-based temple visibility (Admin, Purohit, Public/Customer) is enforced by the service/repository layer
    /*
    const isAdmin = req.user?.role === USER_ROLE.ADMIN;
    return this.templeService.getTemples(query, isAdmin);
    */
    return this.templeService.getTemples(query, req.user);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getTempleById(
    @Req() req: OptionalAuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.templeService.getTempleById(id, req.user);
  }
}
