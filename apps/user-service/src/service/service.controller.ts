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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ServiceService } from './service.service';
import { JwtAuthGuard, Roles, RolesGuard } from '@likemyproduct/common';
import { USER_ROLE } from '@likemyproduct/entities';
import { CreateServiceDto } from '@likemyproduct/dtos/service/create.service.dto';
import { UpdateServiceDto } from '@likemyproduct/dtos/service/update.service.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { GetServicesQueryDto } from '@likemyproduct/dtos/service/get.services.query.dto';

@Controller('service')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @Get()
  async findAllServices(@Query() query: GetServicesQueryDto) {
    return this.serviceService.findAllServices(query);
  }

  @Post()
  @Roles(USER_ROLE.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FileFieldsInterceptor([
      {
        name: 'icon',
        maxCount: 1,
      },
    ]),
  )
  @HttpCode(HttpStatus.CREATED)
  async createService(
    @Body() dto: CreateServiceDto,
    @UploadedFiles()
    files: {
      icon?: Express.Multer.File[];
    },
  ) {
    return this.serviceService.createService(dto, files);
  }

  @Patch(':id')
  @Roles(USER_ROLE.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FileFieldsInterceptor([
      {
        name: 'icon',
        maxCount: 1,
      },
    ]),
  )
  @HttpCode(HttpStatus.OK)
  async updateService(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
    @UploadedFiles()
    files: {
      icon?: Express.Multer.File[];
    },
  ) {
    return this.serviceService.updateService(id, dto, files);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findServiceById(@Param('id', ParseIntPipe) id: number) {
    return this.serviceService.findServiceById(id);
  }

  @Delete(':id')
  @Roles(USER_ROLE.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async deleteService(@Param('id', ParseIntPipe) id: number) {
    return this.serviceService.deleteService(id);
  }
}
