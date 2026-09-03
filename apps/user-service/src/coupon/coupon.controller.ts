import { Body, Controller, HttpCode, HttpStatus, Post, Get, Patch, Delete, Query, Req, UseGuards, Param, ParseIntPipe, ValidationPipe,} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard, CsrfGuard,} from '@poojawala/common';
import { USER_ROLE, DISCOUNT_TYPE } from '@poojawala/entities';
import { CreateCouponDto } from '@poojawala/dtos';
import { CouponService } from './coupon.service';

@Controller('coupons')
export class CouponController {
  constructor(
    private readonly couponService: CouponService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  createCoupon(
    @Req() req: any,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: CreateCouponDto,
  ) {
    return this.couponService.createCoupon(
      dto,
      req.user.id,
    );
  }

  @Get()
  getAllCoupons(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('isActive') isActive?: boolean,
    @Query('discountType') discountType?: DISCOUNT_TYPE,
  ) {
    return this.couponService.getAllCoupons(
      Number(page),
      Number(limit),
      search,
      isActive,
      discountType,
    );
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  getCouponById(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.couponService.getCouponById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  updateCoupon(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: CreateCouponDto,
    @Req() req: any,
  ) {
    return this.couponService.updateCoupon(
      id,
      dto,
      req.user.id,
    );
  }


  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  deleteCoupon(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.couponService.deleteCoupon(id, req.user.id);
  }


  @Patch(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  restoreCoupon(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.couponService.restoreCoupon(id, req.user.id);
  }

}