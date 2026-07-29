import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards, } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateBookingDto, UpdateBookingDto, BookingQueryDto, CancelBookingDto, RespondBookingDto, AssignBookingDto, UpdateBookingStatusDto } from '@likemyproduct/dtos';
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from '@likemyproduct/common';
import { USER_ROLE, User } from '@likemyproduct/entities';

interface AuthenticatedRequest extends Request {
  user: User;
}

@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
export class BookingController {
  constructor(
    private readonly bookingService: BookingService,
  ) {}

  @Post('add')
  @Roles(USER_ROLE.CUSTOMER)
  createBooking(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingService.createBooking(
      req.user,
      dto,
    );
  }
  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  getBookings(
    @Req() req: AuthenticatedRequest,
    @Query() query: BookingQueryDto,
  ) {
    return this.bookingService.getBookings(
      req.user,
      query,
    );
  }

  @Patch(':id')
  @Roles(USER_ROLE.CUSTOMER)
  updateBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe)
    id: number,
    @Body() dto: UpdateBookingDto,
  ) {
    return this.bookingService.updateBooking(
      req.user,
      id,
      dto,
    );
  }

  @Patch(':id/cancel')
  @Roles( USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ADMIN )
  cancelBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) bookingId: number,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingService.cancelBooking(
      req.user,
      bookingId,
      dto,
    );
  }

  @Patch(':id/respond')
  @Roles(USER_ROLE.PUROHIT)
  respondToBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) bookingId: number,
    @Body() dto: RespondBookingDto,
  ) {
    return this.bookingService.respondToBooking(
      req.user,
      bookingId,
      dto,
    );
  }

  @Patch(':id/assign')
  @Roles(USER_ROLE.ADMIN)
  assignBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) bookingId: number,
    @Body() dto: AssignBookingDto,
  ) {
    return this.bookingService.assignBookingToPurohit(
      req.user,
      bookingId,
      dto,
    );
  }

  @Get('available')
  @Roles(USER_ROLE.PUROHIT)
  getAvailableBookings(
    @Req() req: AuthenticatedRequest,
    @Query() query: BookingQueryDto,
  ) {
    return this.bookingService
      .getAvailableBookings(
        req.user,
        query,
      );
  }

  @Patch(':id/status')
  @Roles(USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  updateBookingStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) bookingId: number,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingService.updateBookingStatus(
      req.user,
      bookingId,
      dto,
    );
  }
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  getBookingById(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.bookingService.getBookingById(
      req.user,
      id,
    );
  }
}