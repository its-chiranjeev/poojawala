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
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateBlogPostDto, UpdateBlogPostDto } from '@poojawala/dtos';

describe('BlogService', () => {
  let service: BlogService;
  let postRepo: Partial<Record<keyof Repository<BlogPost>, jest.Mock>>;
  let categoryRepo: Partial<Record<keyof Repository<BlogCategory>, jest.Mock>>;
  let auditLogService: { createAuditLog: jest.Mock };
  let s3Service: {
    uploadFile: jest.Mock;
    deleteByUrl: jest.Mock;
    isVercelBlobUrl: jest.Mock;
    getDownloadUrl: jest.Mock;
  };

  const mockCategory: BlogCategory = {
    id: 1,
    name: 'Puja & Rituals',
    description: 'Articles related to puja',
    metaTitle: null,
    metaDescription: null,
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
    authorName: 'Pt. Ramesh Sharma',
    categoryId: 1,
    blogCategory: mockCategory,
    category: 'Puja & Rituals',
    readTime: 5,
    sections: [
      {
        title: 'Introduction',
        description: '<p>Satyanarayan Puja is a holy ritual.</p>',
      },
    ],
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
      getDownloadUrl: jest.fn().mockImplementation((url: string) => Promise.resolve(url || '')),
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
        authorName: 'Pt. Ramesh Sharma',
      });

      expect(result).toBeDefined();
      expect(postRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BlogPostStatus.PUBLISHED,
          publishedAt: expect.any(Date),
          authorName: 'Pt. Ramesh Sharma',
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
        authorName: 'Pt. Ramesh Sharma',
        status: BlogPostStatus.DRAFT,
      });

      expect(result).toBeDefined();
      expect(postRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BlogPostStatus.DRAFT,
          publishedAt: null,
          authorName: 'Pt. Ramesh Sharma',
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
          authorName: 'Pt. Ramesh Sharma',
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
        categoryId: 1,
        authorName: 'Pt. Ramesh Sharma',
        sections: [
          {
            title: 'Section 1',
            description: '<p>Hello</p><script>alert("hacked")</script><img src="x" onerror="alert(1)">',
          },
        ],
      });

      const createCall = postRepo.create!.mock.calls[0][0];
      expect(createCall.sections[0].description).not.toContain('<script>');
      expect(createCall.sections[0].description).not.toContain('onerror=');
      expect(createCall.sections[0].description).toContain('<p>Hello</p>');
    });

    it('createPost - should create blog post without categoryId (nullable categoryId)', async () => {
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ ...mockPost, categoryId: null, blogCategory: null }),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.createPost(1, {
        title: 'Diwali Puja Vidhi',
        category: 'Diwali Puja',
        authorName: 'Pt. Ramesh Sharma',
        readTime: 7,
        sections: [
          {
            title: 'What is Diwali Puja?',
            description: 'Diwali is the festival of lights.',
          },
        ],
      });

      expect(result).toBeDefined();
      expect(postRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Diwali Puja Vidhi',
          categoryId: null,
          category: 'Diwali Puja',
          authorName: 'Pt. Ramesh Sharma',
          readTime: 7,
          sections: expect.arrayContaining([
            expect.objectContaining({ title: 'What is Diwali Puja?' }),
          ]),
        }),
      );
    });

    it('createPost - should create blog post with both categoryId and custom category', async () => {
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
        title: 'Satyanarayan Puja',
        categoryId: 1,
        category: 'Puja & Rituals',
        authorName: 'Pt. Ramesh Sharma',
        readTime: 5,
        sections: [{ title: 'Intro', description: 'Description' }],
      });

      expect(postRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: 1,
          category: 'Puja & Rituals',
          authorName: 'Pt. Ramesh Sharma',
          readTime: 5,
        }),
      );
    });

    it('createPost - should reject publishing if sections array is empty', async () => {
      await expect(
        service.createPost(1, {
          title: 'Empty Blog',
          status: BlogPostStatus.PUBLISHED,
          authorName: 'Pt. Ramesh Sharma',
          sections: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updatePost - update readTime, sections, categoryId, and custom category', async () => {
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

      await service.updatePost(1, 101, {
        readTime: 12,
        category: 'Updated Custom Category',
        categoryId: null,
        sections: [
          { title: 'New Section 1', description: 'Content 1' },
          { title: 'New Section 2', description: 'Content 2' },
        ],
      });

      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          readTime: 12,
          category: 'Updated Custom Category',
          categoryId: null,
          sections: [
            { title: 'New Section 1', description: 'Content 1' },
            { title: 'New Section 2', description: 'Content 2' },
          ],
        }),
      );
    });

    it('updatePost - status transition: DRAFT -> PUBLISHED sets publishedAt and logs BLOG_POST_PUBLISHED', async () => {
      const draftPost = {
        ...mockPost,
        status: BlogPostStatus.DRAFT,
        publishedAt: null,
        sections: [{ title: 'Intro', description: 'Desc' }],
      };
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
        sections: [{ title: 'Intro', description: 'Desc' }],
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
        sections: [{ title: 'Intro', description: 'Desc' }],
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
            readTime: 5,
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
      expect(result.data[0].sections).toBeDefined();
      expect(result.data[0].readTime).toBe(5);
    });

    it('getPosts - security: public user cannot expose drafts using query status=DRAFT', async () => {
      const qbMock: any = {
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
      expect(result.downloadUrl).toBe(mockPost.coverImage);
      expect(result.authorName).toBe('Pt. Ramesh Sharma');
      expect((result as any).author).toBeUndefined();
    });

    it('getPostById - public mode: includes downloadUrl and authorName, does NOT include author User object', async () => {
      const publishedPost = {
        ...mockPost,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: new Date(),
        coverImage: 'https://blob.vercel-storage.com/blog-images/101/pic.jpg',
        authorName: 'Pt. Ramesh Sharma',
      };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(publishedPost),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.getPostById(101, false);

      expect(result.id).toBe(101);
      expect(result.coverImage).toBe('https://blob.vercel-storage.com/blog-images/101/pic.jpg');
      expect(result.downloadUrl).toBe('https://blob.vercel-storage.com/blog-images/101/pic.jpg');
      expect(result.authorName).toBe('Pt. Ramesh Sharma');
      expect(result.author).toBeUndefined();
    });

    it('getPosts - public mode: includes authorName and does NOT include author User object', async () => {
      const publishedPost = {
        ...mockPost,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: new Date(),
        coverImage: 'https://blob.vercel-storage.com/blog-images/101/pic.jpg',
        authorName: 'Pt. Ramesh Sharma',
      };
      const qbMock: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([publishedPost]),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.getPosts(false, { page: 1, limit: 10 });

      expect(result.data.length).toBe(1);
      expect(result.data[0].authorName).toBe('Pt. Ramesh Sharma');
      expect((result.data[0] as any).author).toBeUndefined();
    });

    it('getPosts - admin mode: includes authorName and does NOT include author User object', async () => {
      const draftPost = {
        ...mockPost,
        authorName: 'Pt. Ramesh Sharma',
      };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([draftPost]),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.getPosts(true, { page: 1, limit: 10 });

      expect(result.data.length).toBe(1);
      expect(result.data[0].authorName).toBe('Pt. Ramesh Sharma');
      expect((result.data[0] as any).author).toBeUndefined();
    });

    it('updatePost - update authorName to Acharya Amit Sharma', async () => {
      const existingPost = {
        ...mockPost,
        authorName: 'Pt. Ramesh Sharma',
      };
      const updatedPost = {
        ...mockPost,
        authorName: 'Acharya Amit Sharma',
      };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingPost),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      // Subsequent getPostById call
      const qbDetailMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(updatedPost),
      };
      postRepo.createQueryBuilder!.mockReturnValueOnce(qbMock).mockReturnValueOnce(qbDetailMock);

      const result = await service.updatePost(1, 101, {
        authorName: 'Acharya Amit Sharma',
      });

      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authorName: 'Acharya Amit Sharma',
        }),
      );
      expect(result.authorName).toBe('Acharya Amit Sharma');
      expect((result as any).author).toBeUndefined();
    });
  });

  describe('DTO Validation: authorName', () => {
    it('CreateBlogPostDto - rejects empty authorName', async () => {
      const dto = plainToInstance(CreateBlogPostDto, {
        title: 'Valid Title',
        authorName: '',
      });
      const errors = await validate(dto);
      const authorError = errors.find((e) => e.property === 'authorName');
      expect(authorError).toBeDefined();
    });

    it('CreateBlogPostDto - rejects non-string authorName', async () => {
      const dto = plainToInstance(CreateBlogPostDto, {
        title: 'Valid Title',
        authorName: 12345,
      });
      const errors = await validate(dto);
      const authorError = errors.find((e) => e.property === 'authorName');
      expect(authorError).toBeDefined();
    });

    it('CreateBlogPostDto - accepts valid authorName with titles and whitespace trimming', async () => {
      const dto = plainToInstance(CreateBlogPostDto, {
        title: 'Valid Title',
        authorName: '  Pt. Ramesh Sharma  ',
      });
      const errors = await validate(dto);
      const authorError = errors.find((e) => e.property === 'authorName');
      expect(authorError).toBeUndefined();
      expect(dto.authorName).toBe('Pt. Ramesh Sharma');
    });

    it('UpdateBlogPostDto - rejects empty string authorName if provided', async () => {
      const dto = plainToInstance(UpdateBlogPostDto, {
        authorName: '',
      });
      const errors = await validate(dto);
      const authorError = errors.find((e) => e.property === 'authorName');
      expect(authorError).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // STANDARDIZED IMAGE HANDLING TESTS (PATCH /blog/admin/posts/:id)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Standardized Image Handling on PATCH /blog/admin/posts/:id', () => {
    it('Case 1a: should save uploaded cover image metadata when valid file is provided', async () => {
      const existing = { ...mockPost };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existing),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);
      s3Service.uploadFile!.mockResolvedValue('https://storage.poojawala.com/new-cover.webp');

      const mockFile = {
        buffer: Buffer.from('cover-image-bytes'),
        mimetype: 'image/webp',
        originalname: 'cover.webp',
      } as Express.Multer.File;

      const result = await service.updatePost(1, 101, {}, mockFile);

      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ coverImage: 'https://storage.poojawala.com/new-cover.webp' }),
      );
      expect(result.coverImage).toBe('https://storage.poojawala.com/new-cover.webp');
    });

    it('Case 1b: should save valid coverImage URL when provided in DTO without file upload', async () => {
      const existing = { ...mockPost };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existing),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.updatePost(
        1,
        101,
        { coverImage: 'https://images.poojawala.com/cdn-cover.jpg' },
        undefined,
      );

      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ coverImage: 'https://images.poojawala.com/cdn-cover.jpg' }),
      );
      expect(result.coverImage).toBe('https://images.poojawala.com/cdn-cover.jpg');
    });

    it('Case 2: should set coverImage to null when coverImage key is absent from payload', async () => {
      const existing = { ...mockPost, coverImage: 'https://storage.poojawala.com/old-cover.jpg' };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existing),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.updatePost(1, 101, { title: 'Updated Title' }, undefined);

      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated Title',
          coverImage: null,
        }),
      );
      expect(result.coverImage).toBeNull();
    });

    it('Case 3: should set coverImage to null when coverImage key is explicitly null or empty', async () => {
      const existing = { ...mockPost, coverImage: 'https://storage.poojawala.com/old-cover.jpg' };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existing),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const resultNull = await service.updatePost(1, 101, { coverImage: null as any }, undefined);
      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ coverImage: null }),
      );
      expect(resultNull.coverImage).toBeNull();

      const resultEmpty = await service.updatePost(1, 101, { coverImage: '   ' }, undefined);
      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ coverImage: null }),
      );
      expect(resultEmpty.coverImage).toBeNull();
    });

    it('should delete old Vercel blob URL when cover image is cleared to null', async () => {
      const existing = {
        ...mockPost,
        coverImage: 'https://blob.vercel-storage.com/old-blog-cover.jpg',
      };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existing),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);
      s3Service.isVercelBlobUrl!.mockReturnValue(true);

      await service.updatePost(1, 101, {}, undefined);

      expect(s3Service.deleteByUrl).toHaveBeenCalledWith('https://blob.vercel-storage.com/old-blog-cover.jpg');
      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ coverImage: null }),
      );
    });

    it('should preserve other blog post fields when coverImage is omitted and set to null', async () => {
      const existing = {
        ...mockPost,
        title: 'Preserved Title',
        excerpt: 'Preserved Excerpt',
        content: '<p>Preserved Content</p>',
        authorName: 'Pt. Ramesh Sharma',
        readTime: 7,
        coverImage: 'https://storage.poojawala.com/cleared-image.jpg',
      };
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existing),
      };
      postRepo.createQueryBuilder!.mockReturnValue(qbMock);

      await service.updatePost(1, 101, {}, undefined);

      expect(postRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Preserved Title',
          excerpt: 'Preserved Excerpt',
          content: '<p>Preserved Content</p>',
          authorName: 'Pt. Ramesh Sharma',
          readTime: 7,
          coverImage: null,
        }),
      );
    });
  });
});
