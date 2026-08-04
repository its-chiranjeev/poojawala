import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Req, UseGuards, Post, Body } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard } from '@likemyproduct/common';
import { USER_ROLE, User } from '@likemyproduct/entities';
import { PaymentService, } from './payment.service';
import { CreatePaymentLinkDto } from '@likemyproduct/dtos';


interface AuthenticatedRequest {
  user: User;
}

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  getHealth() {
    return {
      service: 'payment-service',
      status: 'running',
      port: 8012,
    };
  }

  @Get('details/:paymentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  @HttpCode(HttpStatus.OK)
  async getPaymentDetails(
    @Req() req: AuthenticatedRequest,
    @Param('paymentId', ParseIntPipe)
    paymentId: number,
  ) {
    return this.paymentService.getPaymentDetails(req.user, paymentId);
  }

  @Post('booking/order')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.CREATED)
  async createBookingPaymentOrder(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePaymentLinkDto,
  ) {
    return this.paymentService.createBookingPaymentLink(
      req.user,
      dto,
    );
  }
}
