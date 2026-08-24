import { CreateReviewDto } from '@poojawala/dtos/review/create-review.dto';
import { UpdateReviewStatusDto } from '@poojawala/dtos';
import { ReviewQueryDto } from '@poojawala/dtos/review/review-query.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { CsrfGuard, JwtAuthGuard, RolesGuard, Roles } from '@poojawala/common';
import { USER_ROLE } from '@poojawala/entities';

@Controller('review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) { }

  @Post(':bookingId')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT)
  create(
    @Req() req: any,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: CreateReviewDto
  ) {
    return this.reviewService.create(req.user, bookingId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  findAll(@Req() req: any, @Query() query: ReviewQueryDto) {
    return this.reviewService.findAll(req.user, query);
  }

  @Get(':bookingId')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ADMIN)
  findOne(
    @Req() req: any,
    @Param('bookingId', ParseIntPipe) bookingId: number
  ) {
    return this.reviewService.findOne(req.user, bookingId);
  }

  @Patch(':bookingId/status')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  updateStatus(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.reviewService.updateStatus(bookingId, dto);
  }

  @Delete(':bookingId')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  remove(
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ) {
    return this.reviewService.remove(bookingId);
  }

  @Get('purohit/:purohitId/rating')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  async getPurohitOverallRating(
    @Param('purohitId', ParseIntPipe) purohitId: number,
  ) {
    return await this.reviewService.getPurohitOverallRating(purohitId);
  }
}