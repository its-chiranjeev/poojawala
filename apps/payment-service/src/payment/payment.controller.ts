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
} from '@likemyproduct/common';

import { USER_ROLE, User } from '@likemyproduct/entities';

import {
  CreatePaymentLinkDto,
  PaymentQueryDto,
  AdminPaymentQueryDto,
  CreateRefundDto,
} from '@likemyproduct/dtos';

import { PaymentService, RazorpayWebhookPayload } from './payment.service';

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

  @Post('booking/payment-link')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.CREATED)
  async createBookingPaymentLink(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePaymentLinkDto,
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
}
