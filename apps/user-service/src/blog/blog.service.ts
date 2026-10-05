import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, ILike } from 'typeorm';
import * as crypto from 'crypto';
import {
  BlogPost,
  BlogCategory,
  BlogPostStatus,
  ACTOR_TYPE,
  USER_ROLE,
  AUDIT_MODULE,
} from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';
import { S3Service } from '@poojawala/s3';
import {
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
  CreateBlogPostDto,
  UpdateBlogPostDto,
} from '@poojawala/dtos';

export interface BlogPostsQuery {
  page?: number | string;
  limit?: number | string;
  categoryId?: number | string;
  status?: BlogPostStatus;
  isFeatured?: boolean | string;
  search?: string;
}

export interface BlogCategoriesQuery {
  page?: number | string;
  limit?: number | string;
  isActive?: boolean | string;
  search?: string;
}

@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);

  constructor(
    @InjectRepository(BlogPost)
    private readonly postRepo: Repository<BlogPost>,
    @InjectRepository(BlogCategory)
    private readonly categoryRepo: Repository<BlogCategory>,
    private readonly auditLogService: AuditLogService,
    private readonly s3Service: S3Service,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // CATEGORIES: SHARED READ (PUBLIC & ADMIN)
  // ─────────────────────────────────────────────────────────────────────────────

  async getCategories(isAdmin: boolean, query?: BlogCategoriesQuery) {
    if (isAdmin) {
      // ADMIN MODE: Can see active & inactive non-deleted categories
      const page = Math.max(Number(query?.page) || 1, 1);
      const limit = Math.min(Math.max(Number(query?.limit) || 10, 1), 100);

      const qb = this.categoryRepo
        .createQueryBuilder('category')
        .where('category.deletedAt IS NULL');

      if (query?.isActive !== undefined) {
        qb.andWhere('category.isActive = :isActive', { isActive: query.isActive });
      }

      if (query?.search && query.search.trim()) {
        qb.andWhere(
          '(category.name ILIKE :search OR category.description ILIKE :search)',
          { search: `%${query.search.trim()}%` },
        );
      }

      qb.orderBy('category.sortOrder', 'ASC').addOrderBy('category.createdAt', 'DESC');

      const total = await qb.getCount();
      qb.skip((page - 1) * limit).take(limit);
      const data = await qb.getMany();

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } else {
      // PUBLIC MODE: strictly active categories, non-deleted
      return this.categoryRepo.find({
        where: { isActive: true, deletedAt: IsNull() },
        select: ['id', 'name', 'description', 'sortOrder'],
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
    }
  }

  async getCategoryById(id: number, isAdmin: true): Promise<BlogCategory>;
  async getCategoryById(id: number, isAdmin: false): Promise<{ id: number; name: string; description?: string; sortOrder: number; posts: any[] }>;
  async getCategoryById(id: number, isAdmin: boolean): Promise<any>;
  async getCategoryById(id: number, isAdmin: boolean): Promise<any> {
    const whereCondition: any = { id, deletedAt: IsNull() };
    if (!isAdmin) {
      // Public users cannot see inactive categories
      whereCondition.isActive = true;
    }

    const category = await this.categoryRepo.findOne({
      where: whereCondition,
    });

    if (!category) {
      throw new NotFoundException(`Blog category #${id} not found`);
    }

    if (isAdmin) {
      return category;
    }

    // Public detail shape: include published posts under this category
    const postsResult = await this.getPosts(false, { page: 1, limit: 10, categoryId: id });

    return {
      id: category.id,
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
      posts: postsResult.data,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CATEGORIES: ADMIN WRITE
  // ─────────────────────────────────────────────────────────────────────────────

  async createCategory(adminId: number, dto: CreateBlogCategoryDto) {
    const trimmedName = dto.name.trim();

    // Check for duplicate category name among non-deleted categories
    const existing = await this.categoryRepo.findOne({
      where: { name: ILike(trimmedName), deletedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException(`A category with name "${trimmedName}" already exists`);
    }

    const category = this.categoryRepo.create({
      name: trimmedName,
      description: dto.description?.trim(),
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : 0,
    });

    const saved = await this.categoryRepo.save(category);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.BLOG,
      entity: 'BlogCategory',
      entityId: String(saved.id),
      action: 'BLOG_CATEGORY_CREATED',
      message: `Admin created blog category "${saved.name}".`,
      newValue: {
        id: saved.id,
        name: saved.name,
        isActive: saved.isActive,
        sortOrder: saved.sortOrder,
      },
    });

    return saved;
  }

  async updateCategory(adminId: number, id: number, dto: UpdateBlogCategoryDto) {
    const category = await this.categoryRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!category) {
      throw new NotFoundException(`Blog category #${id} not found`);
    }
    const oldValue = {
      name: category.name,
      description: category.description,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
    };

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      const duplicate = await this.categoryRepo.findOne({
        where: {
          name: ILike(trimmedName),
          id: Not(id),
          deletedAt: IsNull(),
        },
      });
      if (duplicate) {
        throw new ConflictException(`Another category with name "${trimmedName}" already exists`);
      }
      category.name = trimmedName;
    }

    if (dto.description !== undefined) {
      category.description = dto.description.trim();
    }

    if (dto.isActive !== undefined) {
      category.isActive = dto.isActive;
    }

    if (dto.sortOrder !== undefined) {
      category.sortOrder = dto.sortOrder;
    }

    const updated = await this.categoryRepo.save(category);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.BLOG,
      entity: 'BlogCategory',
      entityId: String(updated.id),
      action: 'BLOG_CATEGORY_UPDATED',
      message: `Admin updated blog category "${updated.name}".`,
      oldValue,
      newValue: {
        name: updated.name,
        description: updated.description,
        isActive: updated.isActive,
        sortOrder: updated.sortOrder,
      },
    });

    return updated;
  }

  async deleteCategory(adminId: number, id: number) {
    const category = await this.categoryRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!category) {
      throw new NotFoundException(`Blog category #${id} not found`);
    }

    // Rule: Check if published posts reference this category
    const publishedCount = await this.postRepo.count({
      where: {
        categoryId: id,
        status: BlogPostStatus.PUBLISHED,
        deletedAt: IsNull(),
      },
    });
    if (publishedCount > 0) {
      throw new ConflictException(
        `Category cannot be deleted because it is currently used by ${publishedCount} published blog post(s). Please unpublish or reassign the posts first.`,
      );
    }

    // Rule: Check if any active posts (drafts) reference this category
    const activePostsCount = await this.postRepo.count({
      where: {
        categoryId: id,
        deletedAt: IsNull(),
      },
    });
    if (activePostsCount > 0) {
      throw new ConflictException(
        `Category cannot be deleted because it still contains ${activePostsCount} active blog post(s). Please delete or reassign them first.`,
      );
    }

    await this.categoryRepo.softDelete(id);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.BLOG,
      entity: 'BlogCategory',
      entityId: String(id),
      action: 'BLOG_CATEGORY_DELETED',
      message: `Admin deleted blog category "${category.name}".`,
      oldValue: { name: category.name },
    });

    return {
      success: true,
      message: `Blog category #${id} deleted successfully`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOG POSTS: SHARED READ (PUBLIC & ADMIN)
  // ─────────────────────────────────────────────────────────────────────────────

  async getPosts(isAdmin: boolean, query: BlogPostsQuery) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);

    const qb = this.postRepo.createQueryBuilder('post');

    if (isAdmin) {
      // ADMIN MODE: View DRAFT and PUBLISHED
      qb.leftJoinAndSelect('post.category', 'category')
        .leftJoin('post.author', 'author')
        .addSelect([
          'author.id',
          'author.firstName',
          'author.lastName',
          'author.username',
          'author.email',
          'author.profileImage',
        ])
        .where('post.deletedAt IS NULL');

      if (query.status) {
        qb.andWhere('post.status = :status', { status: query.status });
      }

      if (query.categoryId) {
        qb.andWhere('post.categoryId = :categoryId', { categoryId: query.categoryId });
      }

      if (query.isFeatured !== undefined) {
        qb.andWhere('post.isFeatured = :isFeatured', { isFeatured: query.isFeatured });
      }

      if (query.search && query.search.trim()) {
        qb.andWhere(
          '(post.title ILIKE :search OR post.excerpt ILIKE :search)',
          { search: `%${query.search.trim()}%` },
        );
      }

      qb.orderBy('post.createdAt', 'DESC');

      const total = await qb.getCount();
      qb.skip((page - 1) * limit).take(limit);
      const data = await qb.getMany();

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } else {
      // PUBLIC MODE: Strictly PUBLISHED + Active Category + Non-deleted
      // NOTE: query.status is strictly ignored for public callers to protect drafts
      qb.innerJoin(
        'post.category',
        'category',
        'category.isActive = true AND category.deletedAt IS NULL',
      )
        .leftJoin('post.author', 'author')
        .select([
          'post.id',
          'post.title',
          'post.excerpt',
          'post.coverImage',
          'post.isFeatured',
          'post.publishedAt',
          'category.id',
          'category.name',
          'author.id',
          'author.firstName',
          'author.lastName',
          'author.profileImage',
        ])
        .where('post.status = :status', { status: BlogPostStatus.PUBLISHED })
        .andWhere('post.deletedAt IS NULL');

      if (query.categoryId) {
        qb.andWhere('post.categoryId = :categoryId', { categoryId: query.categoryId });
      }

      if (query.search && query.search.trim()) {
        qb.andWhere(
          '(post.title ILIKE :search OR post.excerpt ILIKE :search)',
          { search: `%${query.search.trim()}%` },
        );
      }

      // Default sorting: Featured first, newest published first
      qb.orderBy('post.isFeatured', 'DESC').addOrderBy('post.publishedAt', 'DESC');

      const total = await qb.getCount();
      qb.skip((page - 1) * limit).take(limit);
      const posts = await qb.getMany();

      const data = posts.map((post) => ({
        id: post.id,
        title: post.title,
        excerpt: post.excerpt,
        coverImage: post.coverImage,
        category: post.category
          ? {
              id: post.category.id,
              name: post.category.name,
            }
          : null,
        author: post.author
          ? {
              id: post.author.id,
              name: `${post.author.firstName || ''} ${post.author.lastName || ''}`.trim() || 'Admin',
              profileImage: post.author.profileImage,
            }
          : null,
        isFeatured: post.isFeatured,
        publishedAt: post.publishedAt,
      }));

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  }

  async getPostById(id: number, isAdmin: true): Promise<BlogPost>;
  async getPostById(id: number, isAdmin: false): Promise<any>;
  async getPostById(id: number, isAdmin: boolean): Promise<any>;
  async getPostById(id: number, isAdmin: boolean): Promise<any> {
    const qb = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.category', 'category')
      .leftJoin('post.author', 'author')
      .addSelect([
        'author.id',
        'author.firstName',
        'author.lastName',
        'author.username',
        'author.email',
        'author.profileImage',
      ])
      .where('post.id = :id AND post.deletedAt IS NULL', { id });

    if (!isAdmin) {
      // Public mode: strictly published and category must be active and non-deleted
      qb.andWhere('post.status = :status', { status: BlogPostStatus.PUBLISHED })
        .andWhere('category.isActive = true AND category.deletedAt IS NULL');
    }

    const post = await qb.getOne();

    if (!post) {
      throw new NotFoundException(`Blog post #${id} not found`);
    }

    if (isAdmin) {
      return post;
    }

    // Public detail shape
    return {
      id: post.id,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      coverImage: post.coverImage,
      category: post.category
        ? {
            id: post.category.id,
            name: post.category.name,
            description: post.category.description,
          }
        : null,
      author: post.author
        ? {
            id: post.author.id,
            name: `${post.author.firstName || ''} ${post.author.lastName || ''}`.trim() || 'Admin',
            profileImage: post.author.profileImage,
          }
        : null,
      isFeatured: post.isFeatured,
      publishedAt: post.publishedAt,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOG POSTS: ADMIN WRITE
  // ─────────────────────────────────────────────────────────────────────────────

  async createPost(
    adminId: number,
    dto: CreateBlogPostDto,
    coverImageFile?: Express.Multer.File,
  ) {
    // Validate category exists and is active
    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId, deletedAt: IsNull() },
    });
    if (!category) {
      throw new NotFoundException(`Blog category #${dto.categoryId} not found`);
    }
    if (!category.isActive) {
      throw new BadRequestException(`Category "${category.name}" is inactive. Choose an active category.`);
    }

    // Upload cover image to Vercel Blob if provided as file
    let coverImageUrl = dto.coverImage?.trim();
    if (coverImageFile && coverImageFile.buffer && coverImageFile.buffer.length > 0) {
      coverImageUrl = await this.uploadCoverImageToStorage('new', coverImageFile);
    }

    // Content sanitization
    const sanitizedContent = this.sanitizeContent(dto.content);
    if (!sanitizedContent) {
      throw new BadRequestException('Blog content cannot be empty after sanitization');
    }

    const status = dto.status || BlogPostStatus.PUBLISHED;
    const publishedAt = status === BlogPostStatus.PUBLISHED ? new Date() : null;

    const post = this.postRepo.create({
      title: dto.title.trim(),
      excerpt: dto.excerpt?.trim(),
      content: sanitizedContent,
      coverImage: coverImageUrl,
      authorId: adminId,
      categoryId: dto.categoryId,
      status,
      isFeatured: dto.isFeatured ?? false,
      publishedAt,
      metaTitle: dto.metaTitle?.trim(),
      metaDescription: dto.metaDescription?.trim(),
    });

    const saved = await this.postRepo.save(post);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.BLOG,
      entity: 'BlogPost',
      entityId: String(saved.id),
      action: status === BlogPostStatus.PUBLISHED ? 'BLOG_POST_PUBLISHED' : 'BLOG_POST_CREATED',
      message: `Admin created blog post "${saved.title}" with status ${saved.status}.`,
      newValue: {
        id: saved.id,
        title: saved.title,
        status: saved.status,
        publishedAt: saved.publishedAt,
        categoryId: saved.categoryId,
        isFeatured: saved.isFeatured,
      },
    });

    return this.getPostById(saved.id, true);
  }

  async updatePost(
    adminId: number,
    id: number,
    dto: UpdateBlogPostDto,
    coverImageFile?: Express.Multer.File,
  ) {
    // Fetch post including category and author
    const post = await this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.category', 'category')
      .leftJoin('post.author', 'author')
      .addSelect([
        'author.id',
        'author.firstName',
        'author.lastName',
        'author.username',
        'author.email',
        'author.profileImage',
      ])
      .where('post.id = :id AND post.deletedAt IS NULL', { id })
      .getOne();

    if (!post) {
      throw new NotFoundException(`Blog post #${id} not found`);
    }

    const oldValue = {
      title: post.title,
      categoryId: post.categoryId,
      isFeatured: post.isFeatured,
      status: post.status,
      publishedAt: post.publishedAt,
    };

    let statusTransitionAction: 'BLOG_POST_PUBLISHED' | 'BLOG_POST_UNPUBLISHED' | null = null;

    if (dto.categoryId !== undefined) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId, deletedAt: IsNull() },
      });
      if (!category) {
        throw new NotFoundException(`Blog category #${dto.categoryId} not found`);
      }
      if (!category.isActive) {
        throw new BadRequestException(`Category "${category.name}" is inactive`);
      }
      post.categoryId = dto.categoryId;
      post.category = category;
    }

    if (coverImageFile && coverImageFile.buffer && coverImageFile.buffer.length > 0) {
      const oldCoverImage = post.coverImage;
      post.coverImage = await this.uploadCoverImageToStorage(id, coverImageFile);

      // Clean up old cover image from Vercel Blob
      if (oldCoverImage && this.s3Service.isVercelBlobUrl(oldCoverImage)) {
        await this.s3Service.deleteByUrl(oldCoverImage);
      }
    } else if (dto.coverImage !== undefined) {
      post.coverImage = dto.coverImage ? dto.coverImage.trim() : undefined;
    }

    if (dto.title !== undefined) {
      post.title = dto.title.trim();
    }

    if (dto.excerpt !== undefined) {
      post.excerpt = dto.excerpt ? dto.excerpt.trim() : undefined;
    }

    if (dto.content !== undefined) {
      const sanitized = this.sanitizeContent(dto.content);
      if (!sanitized) {
        throw new BadRequestException('Blog content cannot be empty');
      }
      post.content = sanitized;
    }

    if (dto.isFeatured !== undefined) {
      post.isFeatured = dto.isFeatured;
    }

    if (dto.metaTitle !== undefined) {
      post.metaTitle = dto.metaTitle ? dto.metaTitle.trim() : undefined;
    }

    if (dto.metaDescription !== undefined) {
      post.metaDescription = dto.metaDescription ? dto.metaDescription.trim() : undefined;
    }

    // Status transition & publishedAt management (Sections 8, 9, 10)
    if (dto.status !== undefined && dto.status !== post.status) {
      if (dto.status === BlogPostStatus.PUBLISHED) {
        // DRAFT -> PUBLISHED
        if (!post.title || post.title.trim() === '') {
          throw new BadRequestException('Post cannot be published without a title');
        }
        if (!post.content || post.content.trim() === '') {
          throw new BadRequestException('Post cannot be published without content');
        }
        if (!post.category) {
          throw new BadRequestException('Post cannot be published without a valid category');
        }
        if (!post.category.isActive) {
          throw new BadRequestException('Post cannot be published because its category is inactive');
        }
        post.status = BlogPostStatus.PUBLISHED;
        post.publishedAt = new Date();
        statusTransitionAction = 'BLOG_POST_PUBLISHED';
      } else if (dto.status === BlogPostStatus.DRAFT) {
        // PUBLISHED -> DRAFT
        post.status = BlogPostStatus.DRAFT;
        post.publishedAt = null;
        statusTransitionAction = 'BLOG_POST_UNPUBLISHED';
      }
    }

    const saved = await this.postRepo.save(post);

    const auditAction = statusTransitionAction || 'BLOG_POST_UPDATED';
    const auditMessage =
      auditAction === 'BLOG_POST_PUBLISHED'
        ? `Admin published blog post "${saved.title}".`
        : auditAction === 'BLOG_POST_UNPUBLISHED'
        ? `Admin unpublished blog post "${saved.title}" back to DRAFT.`
        : `Admin updated blog post "${saved.title}".`;

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.BLOG,
      entity: 'BlogPost',
      entityId: String(id),
      action: auditAction,
      message: auditMessage,
      oldValue,
      newValue: {
        title: saved.title,
        status: saved.status,
        publishedAt: saved.publishedAt,
        categoryId: saved.categoryId,
        isFeatured: saved.isFeatured,
      },
    });

    return this.getPostById(id, true);
  }

  async deletePost(adminId: number, id: number) {
    const post = await this.postRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!post) {
      throw new NotFoundException(`Blog post #${id} not found`);
    }

    await this.postRepo.softDelete(id);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.BLOG,
      entity: 'BlogPost',
      entityId: String(id),
      action: 'BLOG_POST_DELETED',
      message: `Admin deleted blog post "${post.title}".`,
      oldValue: { title: post.title, status: post.status },
    });

    return {
      success: true,
      message: `Blog post #${id} deleted successfully`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRESERVED IMPLEMENTATIONS (FOR CODE-PRESERVATION & RETRO-COMPATIBILITY)
  // ─────────────────────────────────────────────────────────────────────────────

  // TODO: BLOG_PHASE_1_ARCHITECTURE_CORRECTION - Consolidated into getCategories(isAdmin, query)
  async getAdminCategories(query: BlogCategoriesQuery) {
    return this.getCategories(true, query);
  }

  // TODO: BLOG_PHASE_1_ARCHITECTURE_CORRECTION - Consolidated into getCategories(isAdmin, query)
  async getPublicCategories() {
    return this.getCategories(false);
  }

  // TODO: BLOG_PHASE_1_ARCHITECTURE_CORRECTION - Consolidated into getCategoryById(id, isAdmin)
  async getAdminCategoryById(id: number) {
    return this.getCategoryById(id, true);
  }

  // TODO: BLOG_PHASE_1_ARCHITECTURE_CORRECTION - Consolidated into getCategoryById(id, isAdmin)
  async getPublicCategoryById(id: number) {
    return this.getCategoryById(id, false);
  }

  // TODO: BLOG_PHASE_1_ARCHITECTURE_CORRECTION - Consolidated into getPosts(isAdmin, query)
  async getAdminPosts(query: BlogPostsQuery) {
    return this.getPosts(true, query);
  }

  // TODO: BLOG_PHASE_1_ARCHITECTURE_CORRECTION - Consolidated into getPosts(isAdmin, query)
  async getPublicPosts(query: BlogPostsQuery) {
    return this.getPosts(false, query);
  }

  // TODO: BLOG_PHASE_1_ARCHITECTURE_CORRECTION - Consolidated into getPostById(id, isAdmin)
  async getAdminPostById(id: number) {
    return this.getPostById(id, true);
  }

  // TODO: BLOG_PHASE_1_ARCHITECTURE_CORRECTION - Consolidated into getPostById(id, isAdmin)
  async getPublicPostById(id: number) {
    return this.getPostById(id, false);
  }

  // TODO: BLOG_PHASE_1_ARCHITECTURE_CORRECTION - Consolidated into updatePost with { status: BlogPostStatus.PUBLISHED }
  async publishPost(adminId: number, id: number) {
    return this.updatePost(adminId, id, { status: BlogPostStatus.PUBLISHED });
  }

  // TODO: BLOG_PHASE_1_ARCHITECTURE_CORRECTION - Consolidated into updatePost with { status: BlogPostStatus.DRAFT }
  async unpublishPost(adminId: number, id: number) {
    return this.updatePost(adminId, id, { status: BlogPostStatus.DRAFT });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private sanitizeContent(raw: string): string {
    if (!raw) return '';

    let sanitized = raw;

    // 1. Remove script tags and their content
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // 2. Remove inline event handlers (e.g. onerror=, onload=, onclick=, etc.)
    sanitized = sanitized.replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

    // 3. Remove javascript: pseudo-protocols
    sanitized = sanitized.replace(/javascript\s*:[^"'\s>]*/gi, '');

    // 4. Remove vbscript: pseudo-protocols
    sanitized = sanitized.replace(/vbscript\s*:[^"'\s>]*/gi, '');

    return sanitized.trim();
  }

  private async uploadCoverImageToStorage(
    postId: number | string,
    file: Express.Multer.File,
  ): Promise<string> {
    const ext = this.extractSafeExtension(file.originalname);
    const uniqueFileName = `${crypto.randomUUID()}${ext}`;
    const pathname = `blog-images/${postId}/${uniqueFileName}`;
    return this.s3Service.uploadFile(
      pathname,
      file.buffer,
      file.mimetype || 'image/jpeg',
    );
  }

  private extractSafeExtension(originalName?: string): string {
    if (!originalName) return '.jpg';
    const lastDotIndex = originalName.lastIndexOf('.');
    if (lastDotIndex === -1) return '.jpg';
    const rawExt = originalName.substring(lastDotIndex).toLowerCase();
    const cleanExt = rawExt.replace(/[^a-z0-9.]/g, '');
    return cleanExt || '.jpg';
  }
}
