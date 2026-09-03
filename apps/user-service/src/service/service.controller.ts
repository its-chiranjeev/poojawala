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
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from '@poojawala/common';
import { USER_ROLE } from '@poojawala/entities';
import { CreateServiceDto, CreatePurohitServiceDto } from '@poojawala/dtos/service/create.service.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { GetServicesQueryDto } from '@poojawala/dtos/service/get.services.query.dto';
import { UpdateServiceDto, UpdatePurohitServiceDto, UpdateServiceStatusDto } from '@poojawala/dtos/service/update.service.dto';
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
  async getPurohitServices(@Req() req: Request, @Query() query: GetServicesQueryDto) {

    const user = (req as any).user;
    return this.serviceService.getPurohitServices(user.id, query);
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

  @Get('debug-where')
  async debugWhere(@Req() req: Request, @Query() query: any) {
    let isActive = query.isActive;
    let parsedIsActive: boolean | undefined = undefined;
    if (isActive !== undefined) {
      parsedIsActive = String(isActive) === 'true';
    }
    const where: any = {
      ...(parsedIsActive !== undefined && { isActive: parsedIsActive }),
    };
    return { isActive, parsedIsActive, where };
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
  async findAllServices(@Req() req: Request, @Query() query: GetServicesQueryDto) {
    if (query.isActive === undefined && (req as any).query.isActive !== undefined) {
      query.isActive = (req as any).query.isActive;
    }
    return this.serviceService.findAllServices(query);
  }

  @Patch(':id/status')
  @Roles(USER_ROLE.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async updateServiceStatus(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceStatusDto,
  ) {
    const user = (req as any).user;
    return this.serviceService.updateServiceStatus(id, dto.isActive, user.id);
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
    @Req() req: Request,
    @Body() dto: CreateServiceDto,
    @UploadedFiles()
    files: {
      icon?: Express.Multer.File[];
    },
  ) {
    const user = (req as any).user;
    return this.serviceService.createService(dto, files, user.id);
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
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
    @UploadedFiles()
    files: {
      icon?: Express.Multer.File[];
    },
  ) {
    const user = (req as any).user;
    return this.serviceService.updateService(id, dto, files, user.id);
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
  async deleteService(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = (req as any).user;
    return this.serviceService.deleteService(id, user.id);
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
