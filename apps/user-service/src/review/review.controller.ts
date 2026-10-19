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
import {
  CsrfGuard,
  JwtAuthGuard,
  RolesGuard,
  Roles,
  ROLE_COOKIE_MAP,
  parseCookieHeader,
} from '@poojawala/common';
import { USER_ROLE } from '@poojawala/entities';

export interface ReviewJwtPayload {
  id?: number;
  sub?: number;
  email?: string;
  role?: USER_ROLE | string;
  tokenVersion?: number;
}

@Controller('review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) { }

  @Post(':bookingId')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ASTROLOGER)
  create(
    @Req() req: any,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.create(req.user, bookingId, dto);
  }

  // TODO: Previous implementation kept for reference.
  // Replaced because it only supported Bearer token without case-insensitivity,
  // did not support cookie-based tokens (req.cookies / req.headers.cookie),
  // did not properly decode base64url payloads, lacked sub/id normalization,
  // and initialized user with let user = null without type annotation.
  /*
  @Get()
  findAll(@Req() req: any, @Query() query: ReviewQueryDto) {
    let user = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const base64Payload = token.split('.')[1];
        const payloadBuffer = Buffer.from(base64Payload, 'base64');
        user = JSON.parse(payloadBuffer.toString());
      } catch (e) {
        // Ignore parsing errors
      }
    }
    return this.reviewService.findAll(user, query);
  }
  */

  private extractTokenFromRequest(req: any): string | null {
    // 1. Check Authorization header: "Bearer <token>" (case-insensitive)
    const authHeader = req.headers?.authorization;
    if (typeof authHeader === 'string') {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // 2. Check role-specific access token cookies
    const cookies =
      req.cookies || (req.headers?.cookie ? parseCookieHeader(req.headers.cookie) : {});

    const roleToken =
      cookies[ROLE_COOKIE_MAP[USER_ROLE.CUSTOMER].access] ||
      cookies[ROLE_COOKIE_MAP[USER_ROLE.PUROHIT].access] ||
      cookies[ROLE_COOKIE_MAP[USER_ROLE.ASTROLOGER].access] ||
      cookies[ROLE_COOKIE_MAP[USER_ROLE.ADMIN].access];

    if (roleToken && typeof roleToken === 'string') {
      return roleToken.trim();
    }

    // TODO: Legacy generic auth cookie logic retained for reference.
    // Role-based cookies are now authoritative.
    // if (cookies['accessToken']) return cookies['accessToken'].trim();

    return null;
  }

  private parseJwtPayload(token: string): ReviewJwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) {
        return null;
      }
      const base64Payload = parts[1];
      let jsonString: string;
      try {
        jsonString = Buffer.from(base64Payload, 'base64url').toString('utf-8');
      } catch {
        const normalized = base64Payload.replace(/-/g, '+').replace(/_/g, '/');
        jsonString = Buffer.from(normalized, 'base64').toString('utf-8');
      }
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object') {
        const rawId = parsed.id ?? parsed.sub;
        const normalizedId = rawId !== undefined && rawId !== null ? Number(rawId) : undefined;
        return {
          ...parsed,
          id: normalizedId,
          sub: normalizedId,
        };
      }
      return null;
    } catch {
      // If token payload parsing fails for any reason, treat as guest (null)
      return null;
    }
  }

  @Get()
  findAll(@Req() req: any, @Query() query: ReviewQueryDto) {
    let user: ReviewJwtPayload | null = null;

    if (req.user) {
      const rawId = req.user.id ?? req.user.sub;
      const normalizedId = rawId !== undefined && rawId !== null ? Number(rawId) : undefined;
      user = {
        ...req.user,
        id: normalizedId,
        sub: normalizedId,
      };
    } else {
      const token = this.extractTokenFromRequest(req);
      if (token) {
        user = this.parseJwtPayload(token);
      }
    }

    return this.reviewService.findAll(user, query);
  }

  // NOTE: Static routes defined BEFORE parameterized ':bookingId' route
  // to guarantee that requests like GET /review/customers/given are never captured by ParseIntPipe
  @Get('customers/given')
  async getAllCustomerReviews(@Query() query: ReviewQueryDto) {
    return this.reviewService.getAllCustomerReviews(query);
  }

  @Get('purohit/:purohitId/rating')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  async getPurohitOverallRating(
    @Param('purohitId', ParseIntPipe) purohitId: number,
  ) {
    return await this.reviewService.getPurohitOverallRating(purohitId);
  }

  @Get('astrologer/:astrologerId/rating')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  async getAstrologerOverallRating(
    @Param('astrologerId', ParseIntPipe) astrologerId: number,
  ) {
    return await this.reviewService.getAstrologerOverallRating(astrologerId);
  }

  @Get(':bookingId')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ASTROLOGER, USER_ROLE.ADMIN)
  findOne(
    @Req() req: any,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ) {
    return this.reviewService.findOne(req.user, bookingId);
  }

  @Patch(':bookingId/status')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  updateStatus(
    @Req() req: any,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.reviewService.updateStatus(bookingId, dto, req.user.id);
  }

  @Delete(':bookingId')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  remove(@Req() req: any, @Param('bookingId', ParseIntPipe) bookingId: number) {
    return this.reviewService.remove(bookingId, req.user.id);
  }
}
