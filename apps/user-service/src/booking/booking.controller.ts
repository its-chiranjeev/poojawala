import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards, } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateBookingDto, UpdateBookingDto, BookingQueryDto } from '@likemyproduct/dtos';
import { JwtAuthGuard, Roles, RolesGuard,} from '@likemyproduct/common';
import { USER_ROLE,User } from '@likemyproduct/entities';

interface AuthenticatedRequest extends Request {
  user: User;
}

@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Get('my-bookings')
  @Roles(USER_ROLE.CUSTOMER)
  getMyBookings(
    @Req() req: AuthenticatedRequest,
    @Query() query: BookingQueryDto,
  ) {
    return this.bookingService.getMyBookings(
      req.user,
      query,
    );
  }

  @Get('admin/all')
    @Roles(USER_ROLE.ADMIN)
    getAllBookings(
    @Req() req: AuthenticatedRequest,
    @Query() query: BookingQueryDto,
    ) {
    return this.bookingService.getAllBookings(
        req.user,
        query,
    );
    }

  @Get(':id')
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

  @Delete(':id')
  @Roles(USER_ROLE.CUSTOMER)
  deleteBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.bookingService.deleteBooking(
      req.user,
      id,
    );
  }
}