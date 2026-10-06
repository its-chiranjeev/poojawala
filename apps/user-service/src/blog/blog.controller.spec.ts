jest.mock('puppeteer', () => ({}));

import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard } from '@poojawala/common';
import { USER_ROLE, BlogPostStatus } from '@poojawala/entities';
import { CreateBlogPostDto, UpdateBlogPostDto, BlogPostSectionDto } from '@poojawala/dtos';

describe('BlogController (Consolidated Shared Read + Admin Write)', () => {
  let controller: BlogController;
  let mockBlogService: Partial<Record<keyof BlogService, jest.Mock>>;

  beforeEach(async () => {
    mockBlogService = {
      getCategories: jest.fn().mockResolvedValue([]),
      getCategoryById: jest.fn().mockResolvedValue({ id: 1, name: 'Puja' }),
      getPosts: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      getPostById: jest.fn().mockResolvedValue({ id: 101, title: 'Guide' }),

      createCategory: jest.fn().mockResolvedValue({ id: 1, name: 'Puja & Rituals' }),
      updateCategory: jest.fn().mockResolvedValue({ id: 1, name: 'Updated' }),
      deleteCategory: jest.fn().mockResolvedValue({ success: true }),

      createPost: jest.fn().mockResolvedValue({ id: 101, title: 'Guide' }),
      updatePost: jest.fn().mockResolvedValue({ id: 101, title: 'Updated' }),
      deletePost: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlogController],
      providers: [
        {
          provide: BlogService,
          useValue: mockBlogService,
        },
      ],
    }).compile();

    controller = module.get<BlogController>(BlogController);
  });

  describe('Route authorization metadata', () => {
    it('admin write endpoints should have Roles(ADMIN) and JwtAuthGuard/RolesGuard', () => {
      const adminWriteMethods = [
        'createCategory',
        'updateCategory',
        'deleteCategory',
        'createPost',
        'updatePost',
        'deletePost',
      ];

      for (const method of adminWriteMethods) {
        const target = (controller as any)[method];
        const roles = Reflect.getMetadata('roles', target);
        expect(roles).toEqual([USER_ROLE.ADMIN]);

        const guards = Reflect.getMetadata('__guards__', target);
        expect(guards).toContain(JwtAuthGuard);
        expect(guards).toContain(RolesGuard);
      }
    });

    it('shared read endpoints should have OptionalJwtAuthGuard and NO Roles(ADMIN)', () => {
      const sharedReadMethods = ['getCategories', 'getCategoryById', 'getPosts', 'getPostById'];

      for (const method of sharedReadMethods) {
        const target = (controller as any)[method];
        const roles = Reflect.getMetadata('roles', target);
        expect(roles).toBeUndefined();

        const guards = Reflect.getMetadata('__guards__', target);
        expect(guards).toContain(OptionalJwtAuthGuard);
      }
    });
  });

  describe('Shared Read: Categories', () => {
    it('getCategories - unauthenticated caller (public mode)', async () => {
      const req: any = { user: undefined };
      await controller.getCategories(req, '1', '10', 'true', 'puja');

      expect(mockBlogService.getCategories).toHaveBeenCalledWith(false, {
        page: '1',
        limit: '10',
        isActive: true,
        search: 'puja',
      });
    });

    it('getCategories - admin caller (admin mode)', async () => {
      const req: any = { user: { id: 5, role: USER_ROLE.ADMIN } };
      await controller.getCategories(req, '1', '10', undefined, undefined);

      expect(mockBlogService.getCategories).toHaveBeenCalledWith(true, {
        page: '1',
        limit: '10',
        isActive: undefined,
        search: undefined,
      });
    });

    it('getCategoryById - public caller', async () => {
      const req: any = { user: undefined };
      await controller.getCategoryById(req, 1);
      expect(mockBlogService.getCategoryById).toHaveBeenCalledWith(1, false);
    });

    it('getCategoryById - admin caller', async () => {
      const req: any = { user: { id: 5, role: USER_ROLE.ADMIN } };
      await controller.getCategoryById(req, 1);
      expect(mockBlogService.getCategoryById).toHaveBeenCalledWith(1, true);
    });
  });

  describe('Shared Read: Blog Posts', () => {
    it('getPosts - public caller cannot filter by status or view drafts', async () => {
      const req: any = { user: undefined };
      await controller.getPosts(
        req,
        '1',
        '10',
        '1',
        BlogPostStatus.DRAFT, // Malicious or intentional draft query
        'true',
        'guide',
      );

      expect(mockBlogService.getPosts).toHaveBeenCalledWith(false, {
        page: '1',
        limit: '10',
        categoryId: 1,
        status: undefined, // Must be stripped for non-admin!
        isFeatured: true,
        search: 'guide',
      });
    });

    it('getPosts - admin caller can filter by status', async () => {
      const req: any = { user: { id: 5, role: USER_ROLE.ADMIN } };
      await controller.getPosts(
        req,
        '1',
        '10',
        '1',
        BlogPostStatus.DRAFT,
        'true',
        'guide',
      );

      expect(mockBlogService.getPosts).toHaveBeenCalledWith(true, {
        page: '1',
        limit: '10',
        categoryId: 1,
        status: BlogPostStatus.DRAFT,
        isFeatured: true,
        search: 'guide',
      });
    });

    it('getPostById - public caller', async () => {
      const req: any = { user: undefined };
      await controller.getPostById(req, 101);
      expect(mockBlogService.getPostById).toHaveBeenCalledWith(101, false);
    });

    it('getPostById - admin caller', async () => {
      const req: any = { user: { id: 5, role: USER_ROLE.ADMIN } };
      await controller.getPostById(req, 101);
      expect(mockBlogService.getPostById).toHaveBeenCalledWith(101, true);
    });
  });

  describe('Admin Write: Categories', () => {
    const adminReq: any = { user: { id: 42, role: USER_ROLE.ADMIN } };

    it('createCategory uses actual authenticated admin ID', async () => {
      const dto = { name: 'Puja & Rituals' };
      await controller.createCategory(adminReq, dto as any);
      expect(mockBlogService.createCategory).toHaveBeenCalledWith(42, dto);
    });

    it('updateCategory uses actual authenticated admin ID', async () => {
      const dto = { name: 'Updated' };
      await controller.updateCategory(adminReq, 1, dto);
      expect(mockBlogService.updateCategory).toHaveBeenCalledWith(42, 1, dto);
    });

    it('deleteCategory uses actual authenticated admin ID', async () => {
      await controller.deleteCategory(adminReq, 1);
      expect(mockBlogService.deleteCategory).toHaveBeenCalledWith(42, 1);
    });
  });

  describe('Admin Write: Blog Posts (with status transitions)', () => {
    const adminReq: any = { user: { id: 42, role: USER_ROLE.ADMIN } };

    it('createPost uses actual authenticated admin ID', async () => {
      const dto = { title: 'Guide', content: '<p>Content</p>', categoryId: 1 };
      const file = { buffer: Buffer.from('img') } as any;
      await controller.createPost(adminReq, dto as any, file);
      expect(mockBlogService.createPost).toHaveBeenCalledWith(42, dto, file);
    });

    it('updatePost handles status update through PATCH /admin/blog/posts/:id', async () => {
      const dto = { status: BlogPostStatus.PUBLISHED };
      await controller.updatePost(adminReq, 101, dto);
      expect(mockBlogService.updatePost).toHaveBeenCalledWith(42, 101, dto, undefined);
    });

    it('deletePost uses actual authenticated admin ID', async () => {
      await controller.deletePost(adminReq, 101);
      expect(mockBlogService.deletePost).toHaveBeenCalledWith(42, 101);
    });

    describe('Multipart DTO Transformation and Validation', () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

      it('validates multipart/form-data payload with sections string for CreateBlogPostDto', async () => {
        const payload = {
          title: 'ertyuijuhygfd',
          content: 'dfghjkjhgfdsfghjk',
          sections: '[{"title":"fghjkjhgf","description":"dfghjkjhgfdfghjhgfdfghgfdfghgfdfgfdfg"}]',
          readTime: '2',
          category: 'fghjkjhgf',
          status: 'PUBLISHED',
          isFeatured: 'true',
          authorName: 'dfghjkjhgf',
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: CreateBlogPostDto,
        })) as CreateBlogPostDto;

        expect(result.readTime).toBe(2);
        expect(result.isFeatured).toBe(true);
        expect(Array.isArray(result.sections)).toBe(true);
        expect(result.sections).toHaveLength(1);
        expect(result.sections![0]).toBeInstanceOf(BlogPostSectionDto);
        expect(result.sections![0].title).toBe('fghjkjhgf');
        expect(result.sections![0].description).toBe('dfghjkjhgfdfghjhgfdfghgfdfghgfdfgfdfg');
      });

      it('transforms isFeatured "false" string to boolean false', async () => {
        const payload = {
          title: 'Valid Title Here',
          authorName: 'Author Name',
          isFeatured: 'false',
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: CreateBlogPostDto,
        })) as CreateBlogPostDto;

        expect(result.isFeatured).toBe(false);
      });

      it('accepts sections when already provided as an array', async () => {
        const payload = {
          title: 'Valid Title Here',
          authorName: 'Author Name',
          sections: [{ title: 'Required Samagri', description: 'Common puja materials include...' }],
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: CreateBlogPostDto,
        })) as CreateBlogPostDto;

        expect(Array.isArray(result.sections)).toBe(true);
        expect(result.sections![0]).toBeInstanceOf(BlogPostSectionDto);
        expect(result.sections![0].title).toBe('Required Samagri');
      });

      it('rejects invalid JSON string for sections with 400 Bad Request', async () => {
        const payload = {
          title: 'Valid Title Here',
          authorName: 'Author Name',
          sections: 'invalid-json-string',
        };

        await expect(
          pipe.transform(payload, { type: 'body', metatype: CreateBlogPostDto }),
        ).rejects.toThrow();
      });

      it('rejects sections that parse into a non-array with 400 Bad Request', async () => {
        const payload = {
          title: 'Valid Title Here',
          authorName: 'Author Name',
          sections: '{"title":"single-object"}',
        };

        await expect(
          pipe.transform(payload, { type: 'body', metatype: CreateBlogPostDto }),
        ).rejects.toThrow();
      });

      it('rejects unknown properties inside sections when forbidNonWhitelisted is enabled', async () => {
        const payload = {
          title: 'Valid Title Here',
          authorName: 'Author Name',
          sections: '[{"title":"Test","description":"Test","unknownField":"abc"}]',
        };

        await expect(
          pipe.transform(payload, { type: 'body', metatype: CreateBlogPostDto }),
        ).rejects.toThrow();
      });

      it('rejects section when title or description is missing', async () => {
        const payload = {
          title: 'Valid Title Here',
          authorName: 'Author Name',
          sections: '[{"title":"Only Title"}]',
        };

        await expect(
          pipe.transform(payload, { type: 'body', metatype: CreateBlogPostDto }),
        ).rejects.toThrow();
      });

      it('validates multipart sections string in UpdateBlogPostDto', async () => {
        const payload = {
          sections: '[{"title":"Updated Section","description":"Updated Description"}]',
          isFeatured: 'true',
          readTime: '5',
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: UpdateBlogPostDto,
        })) as UpdateBlogPostDto;

        expect(result.readTime).toBe(5);
        expect(result.isFeatured).toBe(true);
        expect(Array.isArray(result.sections)).toBe(true);
        expect(result.sections![0]).toBeInstanceOf(BlogPostSectionDto);
        expect(result.sections![0].title).toBe('Updated Section');
        expect(result.sections![0].description).toBe('Updated Description');
      });

      it('rejects unknown properties in sections in UpdateBlogPostDto', async () => {
        const payload = {
          sections: '[{"title":"Test","description":"Test","unexpected":"123"}]',
        };

        await expect(
          pipe.transform(payload, { type: 'body', metatype: UpdateBlogPostDto }),
        ).rejects.toThrow();
      });
    });
  });
});
