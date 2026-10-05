jest.mock('puppeteer', () => ({}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { BlogService } from './blog.service';
import {
  BlogPost,
  BlogCategory,
  BlogPostStatus,
  AUDIT_MODULE,
} from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';
import { S3Service } from '@poojawala/s3';

describe('BlogService', () => {
  let service: BlogService;
  let postRepo: Partial<Record<keyof Repository<BlogPost>, jest.Mock>>;
  let categoryRepo: Partial<Record<keyof Repository<BlogCategory>, jest.Mock>>;
  let auditLogService: { createAuditLog: jest.Mock };
  let s3Service: {
    uploadFile: jest.Mock;
    deleteByUrl: jest.Mock;
    isVercelBlobUrl: jest.Mock;
  };

  const mockCategory: BlogCategory = {
    id: 1,
    name: 'Puja & Rituals',
    description: 'Articles related to puja',
    isActive: true,
    sortOrder: 1,
    posts: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: undefined,
  };

  const mockInactiveCategory: BlogCategory = {
    id: 2,
    name: 'Archived Category',
    description: 'Inactive category',
    isActive: false,
    sortOrder: 2,
    posts: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: undefined,
  };

  const mockPost: BlogPost = {
    id: 101,
    title: 'How to Perform Satyanarayan Puja',
    excerpt: 'A simple guide to Satyanarayan Puja',
    content: '<p>Satyanarayan Puja is a holy ritual.</p>',
    coverImage: 'https://blob.vercel-storage.com/blog-images/101/pic.jpg',
    authorId: 1,
    categoryId: 1,
    category: mockCategory,
    status: BlogPostStatus.DRAFT,
    isFeatured: false,
    publishedAt: null,
    metaTitle: 'Satyanarayan Guide',
    metaDescription: 'Complete guide',
    createdAt: new Date('2026-01-02'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: undefined,
  };

  beforeEach(async () => {
    postRepo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 101, ...entity })),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };

    categoryRepo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };

    auditLogService = {
      createAuditLog: jest.fn().mockResolvedValue({}),
    };

    s3Service = {
      uploadFile: jest.fn().mockResolvedValue('https://blob.vercel-storage.com/blog-images/101/new-pic.jpg'),
      deleteByUrl: jest.fn().mockResolvedValue(undefined),
      isVercelBlobUrl: jest.fn((url: string) => url?.includes('blob.vercel-storage.com')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlogService,
        {
          provide: getRepositoryToken(BlogPost),
          useValue: postRepo,
        },
        {
          provide: getRepositoryToken(BlogCategory),
          useValue: categoryRepo,
        },
        {
          provide: AuditLogService,
          useValue: auditLogService,
        },
        {
          provide: S3Service,
          useValue: s3Service,
        },
      ],
    }).compile();

    service = module.get<BlogService>(BlogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CATEGORIES
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Category Management & Shared Read', () => {
    it('createCategory - should create category successfully', async () => {
      categoryRepo.findOne!.mockResolvedValue(null);

      const result = await service.createCategory(1, {
        name: 'Vedic Astrology',
        description: 'Astrology guide',
        isActive: true,
        sortOrder: 2,
      });

      expect(result).toBeDefined();
      expect(categoryRepo.save).toHaveBeenCalled();
      expect(auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BLOG_CATEGORY_CREATED',
          module: AUDIT_MODULE.BLOG,
        }),
      );
    });

    it('createCategory - should reject duplicate name with ConflictException', async () => {
      categoryRepo.findOne!.mockResolvedValue(mockCategory);

      await expect(
        service.createCategory(1, { name: 'Puja & Rituals' }),
      ).rejects.toThrow(ConflictException);
    });

    it('getCategories - public mode: verify inactive categories are hidden', async () => {
      categoryRepo.find!.mockResolvedValue([mockCategory]);

      const result = await service.getCategories(false);
      expect(categoryRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
      expect(result).toEqual([mockCategory]);
    });

    it('getCategories - admin mode: verify Admin can see inactive categories', async () => {
      const qbMock: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
        getMany: jest.fn().mockResolvedValue([mockCategory, mockInactiveCategory]),
      };
      categoryRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.getCategories(true, { page: 1, limit: 10 });
      expect(qbMock.where).toHaveBeenCalledWith('category.deletedAt IS NULL');
      expect(result.data.length).toBe(2);
    });

    it('getCategoryById - public mode: verify inactive/deleted category is not exposed (throws 404)', async () => {
      categoryRepo.findOne!.mockResolvedValue(null);

      await expect(service.getCategoryById(2, false)).rejects.toThrow(NotFoundException);
      expect(categoryRepo.findOne).toHaveBeenCalledWith({
        where: { id: 2, deletedAt: expect.anything(), isActive: true },
      });
    });

    it('getCategoryById - admin mode: verify Admin can view inactive category', async () => {
      categoryRepo.findOne!.mockResolvedValue(mockInactiveCategory);

      const result = await service.getCategoryById(2, true);
      expect(result.id).toBe(2);
      expect(categoryRepo.findOne).toHaveBeenCalledWith({
        where: { id: 2, deletedAt: expect.anything() },
      });
    });

    it('updateCategory - should update and audit category changes', async () => {
      categoryRepo.findOne!
        .mockResolvedValueOnce(mockCategory) // for getCategoryById(id, true)
        .mockResolvedValueOnce(null); // for duplicate name check

      const result = await service.updateCategory(1, 1, { name: 'Puja, Vrat & Rituals' });
      expect(result).toBeDefined();
      expect(auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BLOG_CATEGORY_UPDATED' }),
      );
    });

    it('deleteCategory - should prevent deleting category with published posts', async () => {
      categoryRepo.findOne!.mockResolvedValue(mockCategory);
      postRepo.count!.mockResolvedValueOnce(3); // 3 published posts

      await expect(service.deleteCategory(1, 1)).rejects.toThrow(ConflictException);
      expect(categoryRepo.softDelete).not.toHaveBeenCalled();
    });

    it('deleteCategory - should soft delete category when no posts reference it', async () => {
      categoryRepo.findOne!.mockResolvedValue(mockCategory);
      postRepo.count!
        .mockResolvedValueOnce(0) // published posts count
        .mockResolvedValueOnce(0); // any active posts count

      const result = await service.deleteCategory(1, 1);
      expect(result.success).toBe(true);
      expect(categoryRepo.softDelete).toHaveBeenCalledWith(1);
      expect(auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BLOG_CATEGORY_DELETED' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOG POSTS: CREATION & STATUS TRANSITIONS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Post Management & Status Transitions', () => {
    it('createPost - should create post as PUBLISHED by default with publishedAt timestamp', async () => {
      categoryRepo.findOne!.mockResolvedValue(mockCategory);

      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockPost),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.createPost(1, {
        title: 'New Puja Guide',
        content: '<p>Valid content</p>',
        categoryId: 1,
      });

      expect(result).toBeDefined();
      expect(postRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BlogPostStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      );
      expect(auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BLOG_POST_PUBLISHED' }),
      );
    });

    it('createPost - should allow explicitly creating post as DRAFT with publishedAt = null', async () => {
      categoryRepo.findOne!.mockResolvedValue(mockCategory);

      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockPost),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.createPost(1, {
        title: 'Draft Puja Guide',
        content: '<p>Valid content</p>',
        categoryId: 1,
        status: BlogPostStatus.DRAFT,
      });

      expect(result).toBeDefined();
      expect(postRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BlogPostStatus.DRAFT,
          publishedAt: null,
        }),
      );
      expect(auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BLOG_POST_CREATED' }),
      );
    });

    it('createPost - should reject creation if category is inactive', async () => {
      categoryRepo.findOne!.mockResolvedValue({ ...mockCategory, isActive: false });

      await expect(
        service.createPost(1, {
          title: 'New Puja Guide',
          content: '<p>Valid content</p>',
          categoryId: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('createPost - should sanitize dangerous HTML content', async () => {
      categoryRepo.findOne!.mockResolvedValue(mockCategory);

      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockPost),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      await service.createPost(1, {
        title: 'New Puja Guide',
        content: '<p>Hello</p><script>alert("hacked")</script><img src="x" onerror="alert(1)">',
        categoryId: 1,
      });

      const createCall = postRepo.create!.mock.calls[0][0];
      expect(createCall.content).not.toContain('<script>');
      expect(createCall.content).not.toContain('onerror=');
      expect(createCall.content).toContain('<p>Hello</p>');
    });

    it('updatePost - status transition: DRAFT -> PUBLISHED sets publishedAt and logs BLOG_POST_PUBLISHED', async () => {
      const draftPost = { ...mockPost, status: BlogPostStatus.DRAFT, publishedAt: null };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(draftPost),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      await service.updatePost(1, 101, { status: BlogPostStatus.PUBLISHED });

      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BlogPostStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      );
      expect(auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BLOG_POST_PUBLISHED' }),
      );
    });

    it('updatePost - status transition: PUBLISHED -> DRAFT sets publishedAt to null and logs BLOG_POST_UNPUBLISHED', async () => {
      const publishedPost = {
        ...mockPost,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: new Date('2026-02-01'),
      };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(publishedPost),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      await service.updatePost(1, 101, { status: BlogPostStatus.DRAFT });

      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BlogPostStatus.DRAFT,
          publishedAt: null,
        }),
      );
      expect(auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BLOG_POST_UNPUBLISHED' }),
      );
    });

    it('updatePost - editing an already PUBLISHED post without changing status preserves original publishedAt', async () => {
      const originalPublishedAt = new Date('2026-02-01T10:00:00Z');
      const publishedPost = {
        ...mockPost,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: originalPublishedAt,
      };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(publishedPost),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      await service.updatePost(1, 101, { title: 'Updated Title' });

      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated Title',
          status: BlogPostStatus.PUBLISHED,
          publishedAt: originalPublishedAt, // Unchanged!
        }),
      );
      expect(auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BLOG_POST_UPDATED' }),
      );
    });

    it('deletePost - should soft delete the blog post', async () => {
      postRepo.findOne!.mockResolvedValue(mockPost);

      const result = await service.deletePost(1, 101);
      expect(result.success).toBe(true);
      expect(postRepo.softDelete).toHaveBeenCalledWith(101);
      expect(auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BLOG_POST_DELETED' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SHARED READ: POSTS & SECURITY
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Shared Read: Blog Posts & Security Rules', () => {
    it('getPosts - public mode: only PUBLISHED and non-deleted posts are returned', async () => {
      const qbMock: any = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([
          {
            ...mockPost,
            status: BlogPostStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        ]),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.getPosts(false, { page: 1, limit: 10 });

      expect(qbMock.where).toHaveBeenCalledWith(
        'post.status = :status',
        { status: BlogPostStatus.PUBLISHED },
      );
      expect(qbMock.andWhere).toHaveBeenCalledWith('post.deletedAt IS NULL');
      expect(result.data.length).toBe(1);
      // Public list should not expose full content
      expect((result.data[0] as any).content).toBeUndefined();
    });

    it('getPosts - security: public user cannot expose drafts using query status=DRAFT', async () => {
      const qbMock: any = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      // Malicious attempt to query drafts
      await service.getPosts(false, { status: BlogPostStatus.DRAFT });

      // Must strictly override query and only query PUBLISHED!
      expect(qbMock.where).toHaveBeenCalledWith(
        'post.status = :status',
        { status: BlogPostStatus.PUBLISHED },
      );
    });

    it('getPosts - admin mode: Admin can view DRAFT and PUBLISHED', async () => {
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
        getMany: jest.fn().mockResolvedValue([
          mockPost, // DRAFT
          { ...mockPost, id: 102, status: BlogPostStatus.PUBLISHED },
        ]),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.getPosts(true, { page: 1, limit: 10 });

      expect(qbMock.where).toHaveBeenCalledWith('post.deletedAt IS NULL');
      expect(result.data.length).toBe(2);
    });

    it('getPostById - public mode: returns 404 for DRAFT post', async () => {
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null), // query filters status=PUBLISHED, so draft returns null
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      await expect(service.getPostById(101, false)).rejects.toThrow(NotFoundException);
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'post.status = :status',
        { status: BlogPostStatus.PUBLISHED },
      );
    });

    it('getPostById - admin mode: Admin can view DRAFT post', async () => {
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockPost),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.getPostById(101, true);

      expect(result.id).toBe(101);
      expect(result.status).toBe(BlogPostStatus.DRAFT);
    });
  });
});
