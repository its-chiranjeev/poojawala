import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { S3Service } from './s3.service';
import * as vercelBlob from '@vercel/blob';

jest.mock('@vercel/blob', () => ({
  put: jest.fn(),
  del: jest.fn(),
}));

describe('S3Service (Vercel Blob Migration)', () => {
  let service: S3Service;
  let configService: ConfigService;

  const mockToken = 'vercel_blob_rw_test_token_12345';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'BLOB_READ_WRITE_TOKEN') return mockToken;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isVercelBlobUrl', () => {
    it('should identify Vercel Blob URLs correctly', () => {
      expect(
        service.isVercelBlobUrl(
          'https://abc.public.blob.vercel-storage.com/profile-images/1/pic-123.jpg',
        ),
      ).toBe(true);
      expect(
        service.isVercelBlobUrl(
          'https://storage.vercel-storage.com/profile-images/1/pic-123.jpg',
        ),
      ).toBe(true);
    });

    it('should return false for legacy AWS S3 URLs or local endpoints', () => {
      expect(
        service.isVercelBlobUrl(
          'https://mybucket.s3.eu-north-1.amazonaws.com/technicians/1/profileImage.jpg',
        ),
      ).toBe(false);
      expect(
        service.isVercelBlobUrl(
          'http://localhost:9000/mybucket/profileImage.jpg',
        ),
      ).toBe(false);
      expect(service.isVercelBlobUrl(null)).toBe(false);
      expect(service.isVercelBlobUrl(undefined)).toBe(false);
      expect(service.isVercelBlobUrl('')).toBe(false);
    });
  });

  describe('uploadProfileImage', () => {
    it('should upload with deterministic pathname and access: public', async () => {
      const mockPutResponse = {
        url: 'https://abc.public.blob.vercel-storage.com/profile-images/42/mock-uuid.jpg',
      };
      (vercelBlob.put as jest.Mock).mockResolvedValue(mockPutResponse);

      const mockFile = {
        originalname: 'my-avatar.PNG',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/png',
      } as Express.Multer.File;

      const resultUrl = await service.uploadProfileImage(42, mockFile);

      expect(resultUrl).toBe(mockPutResponse.url);
      expect(vercelBlob.put).toHaveBeenCalledTimes(1);

      const [calledPathname, calledBuffer, calledOptions] = (vercelBlob.put as jest.Mock).mock.calls[0];
      expect(calledPathname).toMatch(/^profile-images\/42\/[a-f0-9-]+\.png$/);
      expect(calledBuffer).toBe(mockFile.buffer);
      expect(calledOptions).toEqual({
        access: 'public',
        contentType: 'image/png',
        token: mockToken,
      });
    });

    it('should reject empty or missing file buffer', async () => {
      const emptyFile = {
        originalname: 'empty.png',
        buffer: Buffer.from(''),
        mimetype: 'image/png',
      } as Express.Multer.File;

      await expect(service.uploadProfileImage(1, emptyFile)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteByUrl', () => {
    it('should delete from Vercel Blob if URL belongs to Vercel Blob', async () => {
      (vercelBlob.del as jest.Mock).mockResolvedValue(undefined);

      const blobUrl = 'https://abc.public.blob.vercel-storage.com/profile-images/1/photo.jpg';
      await service.deleteByUrl(blobUrl);

      expect(vercelBlob.del).toHaveBeenCalledTimes(1);
      expect(vercelBlob.del).toHaveBeenCalledWith(blobUrl, { token: mockToken });
    });

    it('should NOT call Vercel Blob del if URL is a legacy S3 URL', async () => {
      const s3Url = 'https://mybucket.s3.eu-north-1.amazonaws.com/technicians/1/old-image.jpg';
      await service.deleteByUrl(s3Url);

      expect(vercelBlob.del).not.toHaveBeenCalled();
    });
  });

  describe('getDownloadUrl', () => {
    it('should return Vercel Blob URL directly without generating S3 signed URL', async () => {
      const blobUrl = 'https://abc.public.blob.vercel-storage.com/profile-images/10/pic.jpg';
      const result = await service.getDownloadUrl(blobUrl);
      expect(result).toBe(blobUrl);
    });

    it('should return existing legacy S3 URL directly without crashing', async () => {
      const s3Url = 'https://mybucket.s3.eu-north-1.amazonaws.com/technicians/10/pic.jpg';
      const result = await service.getDownloadUrl(s3Url);
      expect(result).toBe(s3Url);
    });
  });

  describe('Missing BLOB_READ_WRITE_TOKEN error handling', () => {
    it('should throw clear InternalServerErrorException when token is missing', async () => {
      const unconfiguredService = new S3Service({
        get: jest.fn(() => null),
      } as unknown as ConfigService);

      const mockFile = {
        originalname: 'test.jpg',
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      await expect(
        unconfiguredService.uploadProfileImage(1, mockFile),
      ).rejects.toThrow(InternalServerErrorException);

      await expect(
        unconfiguredService.uploadProfileImage(1, mockFile),
      ).rejects.toThrow(/BLOB_READ_WRITE_TOKEN is not configured/);
    });
  });
});
