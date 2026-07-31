import { CreateReviewDto } from '@likemyproduct/dtos/review/create-review.dto';
import {
  Body,
  Controller,
  DefaultValuePipe,
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
import { CsrfGuard, JwtAuthGuard } from '@likemyproduct/common';
import { UpdateReviewDto } from '@likemyproduct/dtos/review/update-review.dto';

@Controller('review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}
  @Post()
  @UseGuards(JwtAuthGuard, CsrfGuard)
  create(@Req() req: any, @Body() dto: CreateReviewDto) {
    return this.reviewService.create(req.user.id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Query('bookingId', ParseIntPipe) bookingId: number,
  ) {
    return this.reviewService.remove(id, req.user.id, bookingId);
  }

  @Get('booking/:bookingId')
  findByBooking(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.reviewService.findByBooking(bookingId, page, limit);
  }

  @Get('purohit/:purohitId/rating')
  async getPurohitOverallRating(
    @Param('purohitId', ParseIntPipe)
    purohitId: number,
  ) {
    return await this.reviewService.getPurohitOverallRating(purohitId);
  }
}
