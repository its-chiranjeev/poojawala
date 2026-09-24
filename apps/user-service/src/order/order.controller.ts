import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@poojawala/common';
import { User, USER_ROLE } from '@poojawala/entities';
import {
  CollectCodPaymentDto,
  GetOrdersQueryDto,
  UpdateOrderStatusDto,
} from '@poojawala/dtos';
import { OrderService } from './order.service';

interface AuthenticatedRequest { user: User }

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) { }

  /**
   * Returns orders:
   * - CUSTOMER: only own orders
   * - ADMIN: all orders with filters/pagination
   * GET /api/orders
   */
  @Get('all')
  @Roles(USER_ROLE.CUSTOMER, USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getOrders(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetOrdersQueryDto,
  ) {
    const result = await this.orderService.getOrders(req.user, query);
    return {
      success: true,
      message: 'Orders retrieved successfully',
      data: result,
    };
  }

  /**
   * Returns a single order by ID:
   * - CUSTOMER: only own order
   * - ADMIN: any order
   * GET /api/orders/:id
   */
  @Get(':id')
  @Roles(USER_ROLE.CUSTOMER, USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getOrderById(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const order = await this.orderService.getOrderById(req.user, id);
    return {
      success: true,
      message: 'Order retrieved successfully',
      data: order,
    };
  }

  /**
   * Updates fulfillment status (ADMIN ONLY)
   * PATCH /api/orders/:id/status
   */
  @Patch(':id/status')
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateOrderStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const order = await this.orderService.updateOrderStatus(req.user, id, dto);
    return {
      success: true,
      message: 'Order status updated successfully',
      data: order,
    };
  }

  /**
   * Marks COD payment as collected (ADMIN ONLY)
   * PATCH /api/orders/:id/collect-cod
   */
  @Patch(':id/collect-cod')
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async collectCodPayment(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CollectCodPaymentDto,
  ) {
    const order = await this.orderService.collectCodPayment(req.user, id, dto);
    return {
      success: true,
      message: 'COD payment collected successfully',
      data: order,
    };
  }
}
