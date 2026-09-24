import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  Res,
} from '@nestjs/common';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  JwtAuthGuard,
  Roles,
  RolesGuard,
  CsrfGuard,
} from '@poojawala/common';

import { USER_ROLE, User } from '@poojawala/entities';

import {
  CreatePaymentLinkDto,
  PaymentQueryDto,
  AdminPaymentQueryDto,
  CreateRefundDto,
  AdminCreatePurohitPayoutDto,
} from '@poojawala/dtos';

import { PaymentService, RazorpayWebhookPayload } from './payment.service';

interface AuthenticatedRequest {
  user: User;
}

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) { }

  // @Get('health')
  // @HttpCode(HttpStatus.OK)
  // getHealth() {
  //   return {
  //     service: 'payment-service',
  //     status: 'running',
  //     port: 8012,
  //   };
  // }

  @Get('booking/payment-link')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  @HttpCode(HttpStatus.OK)
  async createBookingPaymentLink(
    @Req() req: AuthenticatedRequest,
    @Query() dto: CreatePaymentLinkDto,
  ) {
    return this.paymentService.createBookingPaymentLink(req.user, dto);
  }

  @Post('webhook/razorpay')
  @HttpCode(HttpStatus.OK)
  async handleRazorpayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature')
    signature: string,
  ) {
    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new BadRequestException('Raw request body is required');
    }

    const isValid = this.paymentService.verifyWebhook(rawBody, signature);

    if (!isValid) {
      throw new BadRequestException('Invalid Razorpay webhook signature');
    }

    await this.paymentService.processRazorpayWebhook(
      req.body as RazorpayWebhookPayload,
    );

    return {
      success: true,
      message: 'Webhook processed successfully',
    };
  }

  @Get('booking/:bookingId/invoice')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  async downloadBookingInvoice(
    @Req() req: AuthenticatedRequest,

    @Param('bookingId', ParseIntPipe)
    bookingId: number,

    @Res()
    res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.paymentService.generateInvoicePdf(
      req.user,
      bookingId,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.status(HttpStatus.OK).send(buffer);
  }

  @Get('order/:orderId/invoice')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CUSTOMER)
  async downloadOrderInvoice(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } =
      await this.paymentService.generateOrderInvoicePdf(req.user, orderId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.status(HttpStatus.OK).send(buffer);
  }

  @Get('booking/:bookingId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  async getBookingPayments(
    @Req() req: AuthenticatedRequest,
    @Param('bookingId', ParseIntPipe)
    bookingId: number,
  ) {
    return this.paymentService.getBookingPayments(req.user, bookingId);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  async getMyPayments(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentService.getMyPayments(req.user, query);
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

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAllPayments(
    @Query()
    query: AdminPaymentQueryDto,
  ) {
    return this.paymentService.getAllPayments(query);
  }

  @Post(':paymentId/refund')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createRefund(
    @Param('paymentId', ParseIntPipe)
    paymentId: number,

    @Body()
    dto: CreateRefundDto,

    @Req()
    req: AuthenticatedRequest,
  ) {
    return this.paymentService.createRefund(req.user, paymentId, dto);
  }
  @Get('admin/payouts')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAllPurohitPayouts(
    @Query() query: AdminPaymentQueryDto,
  ) {
    const data = await this.paymentService.getAllPurohitPayouts(query);
    return {
      success: true,
      data: data.items,
      meta: data.meta,
    };
  }

  @Get('admin/payouts/finance-stats')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getPurohitPayoutFinanceStats() {
    const data = await this.paymentService.getPurohitPayoutFinanceStats();
    return {
      success: true,
      data,
    };
  }


  @Get('admin/payout/booking/:bookingId')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getPurohitPayoutDetails(
    @Req() req: AuthenticatedRequest,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ) {
    const data = await this.paymentService.getPurohitPayoutDetails(bookingId);
    return {
      success: true,
      data,
    };
  }

  @Post('admin/payout/manual')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async adminRecordPurohitPayout(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AdminCreatePurohitPayoutDto,
  ) {
    const data = await this.paymentService.adminRecordPurohitPayout(req.user.id, dto);
    return {
      success: true,
      message: 'Purohit payout recorded successfully',
      data,
    };
  }

  /**
   * Retries/initiates payment for an existing unpaid order.
   * Customer can click "Pay Now" on any active unpaid order in My Orders.
   * POST /api/payments/orders/:id/pay or POST /api/payments/order/:id/pay
   */
  @Post('order/:id/pay')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  async retryOrderPayment(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.paymentService.createOrderPaymentRetry(req.user, id);
    return {
      success: true,
      message: 'Order payment attempt initiated successfully',
      data: result,
    };
  }

  // @Post('order/:id/pay')
  // @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  // @Roles(USER_ROLE.CUSTOMER)
  // @HttpCode(HttpStatus.OK)
  // async retryOrderPaymentSingular(
  //   @Req() req: AuthenticatedRequest,
  //   @Param('id', ParseIntPipe) id: number,
  // ) {
  //   return this.retryOrderPayment(req, id);
  // }
}

