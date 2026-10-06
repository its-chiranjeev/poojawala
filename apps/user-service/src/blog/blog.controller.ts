import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpStatus,
  HttpCode,
  ParseIntPipe,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard, Roles } from '@poojawala/common';
import { User, USER_ROLE, BlogPostStatus } from '@poojawala/entities';
import {
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
  CreateBlogPostDto,
  UpdateBlogPostDto,
} from '@poojawala/dtos';
import { BlogService } from './blog.service';

interface AuthenticatedRequest extends Request {
  user: User;
}

interface OptionalAuthRequest extends Request {
  user?: User;
}

@Controller('blogs')
export class BlogController {
  constructor(private readonly blogService: BlogService) { }

  // ─────────────────────────────────────────────────────────────────────────────
  // SHARED READ: CATEGORIES
  // (Declared before 'blog/:id' to prevent route conflict)
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('categories')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getCategories(
    @Req() req: OptionalAuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const isAdmin = req.user?.role === USER_ROLE.ADMIN;
    const isActiveBool =
      isActive === undefined ? undefined : isActive === 'true' || isActive === '1';
    return this.blogService.getCategories(isAdmin, {
      page,
      limit,
      isActive: isActiveBool,
      search,
    });
  }

  @Get('categories/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getCategoryById(
    @Req() req: OptionalAuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const isAdmin = req.user?.role === USER_ROLE.ADMIN;
    return this.blogService.getCategoryById(id, isAdmin);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SHARED READ: BLOG POSTS
  // ─────────────────────────────────────────────────────────────────────────────

  @Get("all")
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getPosts(
    @Req() req: OptionalAuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: BlogPostStatus,
    @Query('isFeatured') isFeatured?: string,
    @Query('search') search?: string,
  ) {
    const isAdmin = req.user?.role === USER_ROLE.ADMIN;
    const isFeaturedBool =
      isFeatured === undefined ? undefined : isFeatured === 'true' || isFeatured === '1';
    return this.blogService.getPosts(isAdmin, {
      page,
      limit,
      categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
      status: isAdmin ? status : undefined, // Public callers can NEVER expose drafts
      isFeatured: isFeaturedBool,
      search,
    });
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getPostById(
    @Req() req: OptionalAuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const isAdmin = req.user?.role === USER_ROLE.ADMIN;
    return this.blogService.getPostById(id, isAdmin);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN WRITE: CATEGORIES
  // ─────────────────────────────────────────────────────────────────────────────

  @Post('admin/categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createCategory(
    @Req() req: AuthenticatedRequest,
    @Body(new ValidationPipe({ whitelist: true })) dto: CreateBlogCategoryDto,
  ) {
    const adminId = req.user.id;
    return this.blogService.createCategory(adminId, dto);
  }

  @Patch('admin/categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateCategory(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdateBlogCategoryDto,
  ) {
    const adminId = req.user.id;
    return this.blogService.updateCategory(adminId, id, dto);
  }

  @Delete('admin/categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteCategory(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const adminId = req.user.id;
    return this.blogService.deleteCategory(adminId, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN WRITE: BLOG POSTS
  // (Status is managed directly via PATCH admin/blog/posts/:id; no separate status API)
  // ─────────────────────────────────────────────────────────────────────────────

  @Post('admin/posts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  @UseInterceptors(FileInterceptor('coverImage'))
  @HttpCode(HttpStatus.CREATED)
  async createPost(
    @Req() req: AuthenticatedRequest,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateBlogPostDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const adminId = req.user.id;
    return this.blogService.createPost(adminId, dto, file);
  }

  @Patch('admin/posts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  @UseInterceptors(FileInterceptor('coverImage'))
  @HttpCode(HttpStatus.OK)
  async updatePost(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateBlogPostDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const adminId = req.user.id;
    return this.blogService.updatePost(adminId, id, dto, file);
  }

  @Delete('admin/posts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deletePost(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const adminId = req.user.id;
    return this.blogService.deletePost(adminId, id);
  }
}
