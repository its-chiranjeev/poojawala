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
  BlogPostSection,
  ACTOR_TYPE,
  USER_ROLE,
  AUDIT_MODULE,
} from '@poojawala/entities';
import { AuditLogService, generateUniqueSlug } from '@poojawala/common';
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
          '(CAST(category.id AS TEXT) ILIKE :search OR category.name ILIKE :search OR category.description ILIKE :search)',
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
        select: ['id', 'name', 'slug', 'description', 'sortOrder'],
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
      slug: category.slug ?? null,
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

    const slug = await generateUniqueSlug(this.categoryRepo, trimmedName);

    const category = this.categoryRepo.create({
      name: trimmedName,
      slug,
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
      if (trimmedName !== category.name) {
        category.name = trimmedName;
        category.slug = await generateUniqueSlug(this.categoryRepo, trimmedName, category.id);
      }
    } else if (!category.slug) {
      category.slug = await generateUniqueSlug(this.categoryRepo, category.name, category.id);
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
      qb.leftJoinAndSelect('post.blogCategory', 'blogCategory')
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
          '(CAST(post.id AS TEXT) ILIKE :search OR post.title ILIKE :search OR post.excerpt ILIKE :search OR post.category ILIKE :search OR post.authorName ILIKE :search)',
          { search: `%${query.search.trim()}%` },
        );
      }

      qb.orderBy('post.createdAt', 'DESC');

      const total = await qb.getCount();
      qb.skip((page - 1) * limit).take(limit);
      const rawPosts = await qb.getMany();

      const data = await Promise.all(
        rawPosts.map(async (post) => {
          const downloadUrl = await this.resolveDownloadUrl(post.coverImage);
          return {
            ...post,
            authorName: post.authorName,
            downloadUrl,
          };
        }),
      );

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
      // PUBLIC MODE: Strictly PUBLISHED + (if category is present, active Category) + Non-deleted
      // NOTE: query.status is strictly ignored for public callers to protect drafts
      qb.leftJoin(
        'post.blogCategory',
        'blogCategory',
        'blogCategory.deletedAt IS NULL',
      )
        .select([
          'post.id',
          'post.title',
          'post.excerpt',
          'post.coverImage',
          'post.categoryId',
          'post.category',
          'post.authorName',
          'post.readTime',
          'post.sections',
          'post.isFeatured',
          'post.publishedAt',
          'blogCategory.id',
          'blogCategory.name',
        ])
        .where('post.status = :status', { status: BlogPostStatus.PUBLISHED })
        .andWhere('post.deletedAt IS NULL')
        .andWhere(
          '(post.categoryId IS NULL OR (blogCategory.isActive = true AND blogCategory.deletedAt IS NULL))',
        );

      if (query.categoryId) {
        qb.andWhere('post.categoryId = :categoryId', { categoryId: query.categoryId });
      }

      if (query.search && query.search.trim()) {
        qb.andWhere(
          '(CAST(post.id AS TEXT) ILIKE :search OR post.title ILIKE :search OR post.excerpt ILIKE :search OR post.category ILIKE :search OR post.authorName ILIKE :search)',
          { search: `%${query.search.trim()}%` },
        );
      }

      // Default sorting: Featured first, newest published first
      qb.orderBy('post.isFeatured', 'DESC').addOrderBy('post.publishedAt', 'DESC');

      const total = await qb.getCount();
      qb.skip((page - 1) * limit).take(limit);
      const posts = await qb.getMany();

      const data = await Promise.all(
        posts.map(async (post) => {
          const downloadUrl = await this.resolveDownloadUrl(post.coverImage);
          return {
            id: post.id,
            title: post.title,
            excerpt: post.excerpt,
            coverImage: post.coverImage,
            downloadUrl,
            categoryId: post.categoryId ?? null,
            category: post.category ?? null,
            blogCategory: post.blogCategory
              ? {
                  id: post.blogCategory.id,
                  name: post.blogCategory.name,
                }
              : null,
            authorName: post.authorName,
            readTime: post.readTime ?? null,
            sections: post.sections || [],
            isFeatured: post.isFeatured,
            publishedAt: post.publishedAt,
          };
        }),
      );

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
      .leftJoinAndSelect('post.blogCategory', 'blogCategory')
      .where('post.id = :id AND post.deletedAt IS NULL', { id });

    if (!isAdmin) {
      // Public mode: strictly published and (if category exists) category must be active and non-deleted
      qb.andWhere('post.status = :status', { status: BlogPostStatus.PUBLISHED })
        .andWhere(
          '(post.categoryId IS NULL OR (blogCategory.isActive = true AND blogCategory.deletedAt IS NULL))',
        );
    }

    const post = await qb.getOne();

    if (!post) {
      throw new NotFoundException(`Blog post #${id} not found`);
    }

    const downloadUrl = await this.resolveDownloadUrl(post.coverImage);

    if (isAdmin) {
      return {
        ...post,
        authorName: post.authorName,
        downloadUrl,
      };
    }

    // Public detail shape
    return {
      id: post.id,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      sections: post.sections || [],
      readTime: post.readTime ?? null,
      coverImage: post.coverImage,
      downloadUrl,
      categoryId: post.categoryId ?? null,
      category: post.category ?? null,
      blogCategory: post.blogCategory
        ? {
            id: post.blogCategory.id,
            name: post.blogCategory.name,
            description: post.blogCategory.description,
          }
        : null,
      authorName: post.authorName,
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
    let categoryId: number | null = null;
    if (dto.categoryId != null && !isNaN(Number(dto.categoryId))) {
      const catId = Number(dto.categoryId);
      const category = await this.categoryRepo.findOne({
        where: { id: catId, deletedAt: IsNull() },
      });
      if (!category) {
        throw new NotFoundException(`Blog category #${catId} not found`);
      }
      if (!category.isActive) {
        throw new BadRequestException(`Category "${category.name}" is inactive. Choose an active category.`);
      }
      categoryId = catId;
    }

    // Upload cover image to Vercel Blob if provided as file
    let coverImageUrl = dto.coverImage?.trim();
    if (coverImageFile && coverImageFile.buffer && coverImageFile.buffer.length > 0) {
      coverImageUrl = await this.uploadCoverImageToStorage('new', coverImageFile);
    }

    let sections: BlogPostSection[] = [];
    if (dto.sections) {
      if (typeof dto.sections === 'string') {
        try {
          sections = JSON.parse(dto.sections);
        } catch {
          throw new BadRequestException('Invalid sections JSON format');
        }
      } else if (Array.isArray(dto.sections)) {
        sections = dto.sections;
      }
    }

    sections = (sections || []).map((sec) => ({
      title: sec.title ? this.sanitizeContent(sec.title) : '',
      description: sec.description ? this.sanitizeContent(sec.description) : '',
    }));

    // If sections is empty but legacy content was provided, migrate into sections
    if (sections.length === 0 && dto.content && dto.content.trim()) {
      sections = [
        {
          title: dto.title ? dto.title.trim() : 'Overview',
          description: this.sanitizeContent(dto.content),
        },
      ];
    }

    const status = dto.status || BlogPostStatus.PUBLISHED;
    if (status === BlogPostStatus.PUBLISHED && sections.length === 0) {
      throw new BadRequestException('Blog post cannot be published without at least one content section');
    }

    // TODO: BLOG_POST_SECTIONS_MIGRATION
    // Legacy content column retained as optional; sections[] is the only source of truth for article body
    const sanitizedContent = dto.content ? this.sanitizeContent(dto.content) : null;

    const readTime = dto.readTime != null ? Number(dto.readTime) : null;
    const customCategory = dto.category ? dto.category.trim() : null;

    const publishedAt = status === BlogPostStatus.PUBLISHED ? new Date() : null;
    const authorName = dto.authorName.trim();

    const post = this.postRepo.create({
      title: dto.title.trim(),
      excerpt: dto.excerpt?.trim(),
      content: sanitizedContent,
      sections,
      readTime,
      coverImage: coverImageUrl,
      authorName,
      categoryId,
      category: customCategory,
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
        category: saved.category,
        authorName: saved.authorName,
        readTime: saved.readTime,
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
    // Fetch post including category
    const post = await this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.blogCategory', 'blogCategory')
      .where('post.id = :id AND post.deletedAt IS NULL', { id })
      .getOne();

    if (!post) {
      throw new NotFoundException(`Blog post #${id} not found`);
    }

    const oldValue = {
      title: post.title,
      categoryId: post.categoryId,
      category: post.category,
      authorName: post.authorName,
      readTime: post.readTime,
      isFeatured: post.isFeatured,
      status: post.status,
      publishedAt: post.publishedAt,
    };

    let statusTransitionAction: 'BLOG_POST_PUBLISHED' | 'BLOG_POST_UNPUBLISHED' | null = null;

    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null || (typeof dto.categoryId === 'string' && (dto.categoryId === 'null' || dto.categoryId === ''))) {
        post.categoryId = null;
        post.blogCategory = null;
      } else {
        const catId = Number(dto.categoryId);
        const category = await this.categoryRepo.findOne({
          where: { id: catId, deletedAt: IsNull() },
        });
        if (!category) {
          throw new NotFoundException(`Blog category #${catId} not found`);
        }
        if (!category.isActive) {
          throw new BadRequestException(`Category "${category.name}" is inactive`);
        }
        post.categoryId = catId;
        post.blogCategory = category;
      }
    }

    if (dto.category !== undefined) {
      post.category = dto.category ? dto.category.trim() : null;
    }

    if (dto.readTime !== undefined) {
      post.readTime = dto.readTime != null ? Number(dto.readTime) : null;
    }

    if (dto.sections !== undefined) {
      if (dto.sections === null) {
        post.sections = [];
      } else if (typeof dto.sections === 'string') {
        try {
          post.sections = JSON.parse(dto.sections);
        } catch {
          throw new BadRequestException('Invalid sections JSON format');
        }
      } else if (Array.isArray(dto.sections)) {
        post.sections = dto.sections;
      }
      post.sections = (post.sections || []).map((sec) => ({
        title: sec.title ? this.sanitizeContent(sec.title) : '',
        description: sec.description ? this.sanitizeContent(sec.description) : '',
      }));
    }

    const oldCoverImage = post.coverImage;
    const hasCoverImageFile = Boolean(
      coverImageFile && coverImageFile.buffer && coverImageFile.buffer.length > 0,
    );

    if (hasCoverImageFile && coverImageFile) {
      post.coverImage = await this.uploadCoverImageToStorage(id, coverImageFile);

      // Clean up old cover image from Vercel Blob
      if (
        oldCoverImage &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldCoverImage) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldCoverImage);
      }
    } else if (typeof dto.coverImage === 'string' && dto.coverImage.trim().length > 0) {
      post.coverImage = dto.coverImage.trim();
    } else {
      post.coverImage = null as any;
      if (
        oldCoverImage &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldCoverImage) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldCoverImage);
      }
    }

    if (dto.title !== undefined) {
      post.title = dto.title.trim();
    }

    if (dto.excerpt !== undefined) {
      post.excerpt = dto.excerpt ? dto.excerpt.trim() : undefined;
    }

    if (dto.content !== undefined) {
      post.content = dto.content ? this.sanitizeContent(dto.content) : null;
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

    if (dto.authorName !== undefined) {
      post.authorName = dto.authorName.trim();
    }

    // Status transition & publishedAt management (Sections 8, 9, 10, 11)
    if (dto.status !== undefined && dto.status !== post.status) {
      if (dto.status === BlogPostStatus.PUBLISHED) {
        // DRAFT -> PUBLISHED
        if (!post.title || post.title.trim() === '') {
          throw new BadRequestException('Post cannot be published without a title');
        }
        if (!post.sections || post.sections.length === 0) {
          throw new BadRequestException('Post cannot be published without at least one content section');
        }
        // If a categoryId is set, ensure it exists and is active
        if (post.categoryId != null) {
          if (!post.blogCategory) {
            const cat = await this.categoryRepo.findOne({
              where: { id: post.categoryId, deletedAt: IsNull() },
            });
            if (!cat || !cat.isActive) {
              throw new BadRequestException('Post cannot be published because its category is invalid or inactive');
            }
            post.blogCategory = cat;
          } else if (!post.blogCategory.isActive) {
            throw new BadRequestException('Post cannot be published because its category is inactive');
          }
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
        category: saved.category,
        authorName: saved.authorName,
        readTime: saved.readTime,
        isFeatured: saved.isFeatured,
      },
    });

    return this.getPostById(saved.id, true);
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
    const post = await this.postRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!post) throw new NotFoundException(`Blog post #${id} not found`);
    return this.updatePost(adminId, id, { status: BlogPostStatus.PUBLISHED, coverImage: post.coverImage });
  }

  // TODO: BLOG_PHASE_1_ARCHITECTURE_CORRECTION - Consolidated into updatePost with { status: BlogPostStatus.DRAFT }
  async unpublishPost(adminId: number, id: number) {
    const post = await this.postRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!post) throw new NotFoundException(`Blog post #${id} not found`);
    return this.updatePost(adminId, id, { status: BlogPostStatus.DRAFT, coverImage: post.coverImage });
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

  private async resolveDownloadUrl(coverImage?: string | null): Promise<string | null> {
    if (!coverImage) return null;
    try {
      const url = await this.s3Service.getDownloadUrl(coverImage);
      return url || null;
    } catch {
      return coverImage;
    }
  }
}
