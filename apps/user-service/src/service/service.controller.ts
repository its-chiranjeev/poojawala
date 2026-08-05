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
  Req,
  Request
} from '@nestjs/common';
import { ServiceService } from './service.service';
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from '@likemyproduct/common';
import { USER_ROLE } from '@likemyproduct/entities';
import { CreateServiceDto, CreatePurohitServiceDto } from '@likemyproduct/dtos/service/create.service.dto';
import { UpdateServiceDto, UpdatePurohitServiceDto } from '@likemyproduct/dtos/service/update.service.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { GetServicesQueryDto } from '@likemyproduct/dtos/service/get.services.query.dto';

@Controller('service')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) { }

  //purohit add service
  @Post('purohit-service')
  @Roles(USER_ROLE.PUROHIT)
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @HttpCode(HttpStatus.CREATED)

  async addService(
    @Req() req: Request,
    @Body() dto: CreatePurohitServiceDto,
  ) {

    const user = (req as any).user;

    return this.serviceService.addService(dto, user.id);
  }


  //get purohit services
  @Get('purohit-service')
  @Roles(USER_ROLE.PUROHIT)
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  async getPurohitServices(@Req() req: Request) {

    const user = (req as any).user;
    return this.serviceService.getPurohitServices(user.id);
  }

  //delete purohit service
  @Delete('purohit-service/:id')
  @Roles(USER_ROLE.PUROHIT)
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  async deletePurohitService(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = (req as any).user;
    return this.serviceService.deletePurohitService(id, user.id);
  }

  //update purohit service
  @Patch('purohit-service/:id')
  @Roles(USER_ROLE.PUROHIT)
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  async updatePurohitService(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurohitServiceDto,
  ) {
    const user = (req as any).user;
    return this.serviceService.updatePurohitService(id, dto, user.id);
  }


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

  @Get('purohit-service/:id')
  @Roles(USER_ROLE.PUROHIT)
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  async getPurohitServiceById(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = (req as any).user;
    return this.serviceService.getPurohitServiceById(id, user.id);
  }
}
