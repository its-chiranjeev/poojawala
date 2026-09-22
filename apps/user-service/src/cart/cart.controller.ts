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
  Req,
  UseGuards,
} from '@nestjs/common';
import { CsrfGuard, JwtAuthGuard, Roles, RolesGuard } from '@poojawala/common';
import { User, USER_ROLE } from '@poojawala/entities';
import {
  AddToCartDto,
  CheckoutDto,
  GetCartQueryDto,
  UpdateCartItemDto,
} from '@poojawala/dtos';
import { CartService } from './cart.service';

interface AuthenticatedRequest {
  user: User;
}

@Controller('cart')
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * Adds a product to the authenticated customer's cart.
   * POST /api/cart/items
   */
  @Post('items')
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  async addToCart(@Req() req: AuthenticatedRequest, @Body() dto: AddToCartDto) {
    const cart = await this.cartService.addToCart(req.user, dto);
    return {
      success: true,
      message: 'Product added to cart successfully',
      data: cart,
    };
  }

  /**
   * Returns the authenticated customer's cart with pagination and optional search filter.
   * GET /api/cart
   */
  @Get()
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  async getCart(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetCartQueryDto,
  ) {
    const cart = await this.cartService.getCart(req.user, query);
    return {
      success: true,
      message: 'Cart retrieved successfully',
      data: cart,
    };
  }

  /**
   * Updates the quantity of a specific cart item.
   * PATCH /api/cart/items/:itemId
   */
  @Patch('items/:itemId')
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  async updateCartItem(
    @Req() req: AuthenticatedRequest,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateCartItemDto,
  ) {
    const cart = await this.cartService.updateCartItem(req.user, itemId, dto);
    return {
      success: true,
      message: 'Cart item updated successfully',
      data: cart,
    };
  }

  /**
   * Removes a specific item from the authenticated customer's cart.
   * DELETE /api/cart/items/:itemId
   */
  @Delete('items/:itemId')
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  async removeCartItem(
    @Req() req: AuthenticatedRequest,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.cartService.removeCartItem(req.user, itemId);
  }

  /**
   * Clears all items from the authenticated customer's cart.
   * DELETE /api/cart
   */
  @Delete('clear-all')
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  async clearCart(@Req() req: AuthenticatedRequest) {
    return this.cartService.clearCart(req.user);
  }

  /**
   * Initiates checkout for the items in the customer's cart.
   * POST /api/cart/checkout
   */
  @Post('checkout')
  @Roles(USER_ROLE.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  async checkout(@Req() req: AuthenticatedRequest, @Body() dto: CheckoutDto) {
    const checkoutResult = await this.cartService.checkout(req.user, dto);
    return {
      success: true,
      message: 'Checkout initiated successfully',
      data: checkoutResult,
    };
  }
}
