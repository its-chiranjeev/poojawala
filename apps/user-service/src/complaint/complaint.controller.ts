import { Body, Controller, Post, Patch, Param, Get, Delete, Query, Req, UploadedFiles, UseGuards, UseInterceptors, ValidationPipe, ParseIntPipe, HttpCode, HttpStatus, } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ComplaintService } from './complaint.service';
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard, } from '@poojawala/common';
import { USER_ROLE } from '@poojawala/entities';
import { CreateComplaintDto, UpdateComplaintStatusDto, ComplaintQueryDto, } from '@poojawala/dtos';

@Controller('complaints')
export class ComplaintController {
  constructor(private readonly complaintService: ComplaintService) { }

  @Post('add')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FilesInterceptor('evidence', 5, {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async createComplaint(
    @Req() req: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: CreateComplaintDto,
  ) {
    return this.complaintService.createComplaint(req.user, dto, files);
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  async getComplaints(
    @Req() req: any,
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: ComplaintQueryDto,
  ) {
    return this.complaintService.getComplaints(req.user, query);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateComplaintStatus(
    @Req() req: any,
    @Param('id', ParseIntPipe)
    complaintId: number,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: UpdateComplaintStatusDto,
  ) {
    return this.complaintService.updateComplaintStatus(
      req.user,
      complaintId,
      dto,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteComplaint(
    @Param('id', ParseIntPipe)
    complaintId: number,
  ) {
    return this.complaintService.deleteComplaint(complaintId);
  }

  @Patch(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async restoreComplaint(
    @Param('id', ParseIntPipe)
    complaintId: number,
  ) {
    return this.complaintService.restoreComplaint(complaintId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  @HttpCode(HttpStatus.OK)
  async getComplaintById(
    @Req() req: any,
    @Param('id', ParseIntPipe)
    complaintId: number,
  ) {
    return this.complaintService.getComplaintById(req.user, complaintId);
  }
}
