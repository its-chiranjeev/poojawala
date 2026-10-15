import {
  Body,
  Controller,
  Get,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import {
  CreateBookingDto,
  CreateAstrologyBookingDto,
  UpdateBookingDto,
  BookingQueryDto,
  CancelBookingDto,
  RespondBookingDto,
  AssignBookingDto,
  UpdateBookingStatusDto,
  VerifyStartOtpDto,
  CreateBookingByAdminDto,
  RescheduleBookingDto,
  RepeatBookingDto,
} from '@poojawala/dtos';
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from '@poojawala/common';
import { USER_ROLE, User } from '@poojawala/entities';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

interface AuthenticatedRequest extends Request {
  user: User;
}

@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
export class BookingController {
  constructor(private readonly bookingService: BookingService) { }

  @Post('admin/add')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  createBookingByAdmin(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateBookingByAdminDto,
  ) {
    return this.bookingService.createBookingByAdmin(req.user, dto);
  }

  @Post('add')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  createBooking(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingService.createBooking(req.user, dto);
  }

  @Post('add/astrology')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  createAstrologyBooking(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateAstrologyBookingDto,
  ) {
    return this.bookingService.createAstrologyBooking(req.user, dto);
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ASTROLOGER)
  getBookings(
    @Req() req: AuthenticatedRequest,
    @Query() query: BookingQueryDto,
  ) {
    return this.bookingService.getBookings(req.user, query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  updateBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe)
    id: number,
    @Body() dto: UpdateBookingDto,
  ) {
    return this.bookingService.updateBooking(req.user, id, dto);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  cancelBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) bookingId: number,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingService.cancelBooking(req.user, bookingId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  softDeleteBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe)
    bookingId: number,
  ) {
    return this.bookingService.softDeleteBooking(req.user, bookingId);
  }

  @Patch(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  restoreBooking(
    @Param('id', ParseIntPipe)
    bookingId: number,
  ) {
    return this.bookingService.restoreBooking(bookingId);
  }

  @Patch(':bookingId/reschedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.CUSTOMER)
  async rescheduleBooking(
    @Req() req: AuthenticatedRequest,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: RescheduleBookingDto,
  ) {
    return this.bookingService.rescheduleBooking(req.user, bookingId, dto);
  }

  @Post(':bookingId/repeat')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.CUSTOMER)
  async repeatBooking(
    @Req() req: AuthenticatedRequest,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: RepeatBookingDto,
  ) {
    return this.bookingService.repeatBooking(req.user, bookingId, dto);
  }

  @Get('active')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  async getActiveBookings(
    @Req() req: AuthenticatedRequest,
    @Query() query: BookingQueryDto,
  ) {
    return this.bookingService.getActiveBookings(req.user, query);
  }

  @Patch(':id/respond')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT)
  respondToBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) bookingId: number,
    @Body() dto: RespondBookingDto,
  ) {
    return this.bookingService.respondToBooking(req.user, bookingId, dto);
  }

  @Patch(':id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  assignBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) bookingId: number,
    @Body() dto: AssignBookingDto,
  ) {
    return this.bookingService.assignBookingToPurohit(req.user, bookingId, dto);
  }

  @Get('available')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT)
  getAvailableBookings(
    @Req() req: AuthenticatedRequest,
    @Query() query: BookingQueryDto,
  ) {
    return this.bookingService.getAvailableBookings(req.user, query);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN, USER_ROLE.ASTROLOGER)
  updateBookingStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) bookingId: number,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingService.updateBookingStatus(req.user, bookingId, dto);
  }

  @Post(':id/start-otp')
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  generateStartOtp(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe)
    bookingId: number,
  ) {
    return this.bookingService.generateStartOtp(req.user, bookingId);
  }

  @Post(':id/resend-start-otp')
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  resendStartOtp(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe)
    bookingId: number,
  ) {
    return this.bookingService.resendStartOtp(req.user, bookingId);
  }

  @Post(':id/verify-start-otp')
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  verifyStartOtp(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe)
    bookingId: number,
    @Body()
    dto: VerifyStartOtpDto,
  ) {
    return this.bookingService.verifyStartOtp(req.user, bookingId, dto);
  }

  @Post(':id/completion-proof')
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (request, file, callback) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Only JPG, PNG and WEBP images are allowed',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  uploadCompletionProof(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe)
    bookingId: number,
    @UploadedFiles()
    files: Express.Multer.File[],
  ) {
    return this.bookingService.uploadCompletionProof(
      req.user,
      bookingId,
      files,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ASTROLOGER)
  getBookingById(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.bookingService.getBookingById(req.user, id);
  }
}
