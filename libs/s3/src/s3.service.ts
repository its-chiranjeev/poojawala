// TODO: VERCEL_BLOB_MIGRATION
// Legacy AWS S3 configuration retained temporarily for rollback/reference.
// AWS_S3_BUCKET_NAME
// AWS_S3_ENDPOINT
// AWS_REGION
// AWS_ACCESS_KEY_ID
// AWS_SECRET_ACCESS_KEY
/*
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
*/

import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  HttpException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { put, del } from '@vercel/blob';
import * as crypto from 'crypto';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);

  // TODO: VERCEL_BLOB_MIGRATION
  // Legacy AWS S3 configuration retained temporarily for rollback/reference.
  // AWS_S3_BUCKET_NAME
  // AWS_S3_ENDPOINT
  // AWS_REGION
  // AWS_ACCESS_KEY_ID
  // AWS_SECRET_ACCESS_KEY
  /*
  private s3Client: S3Client;
  private bucketName: string;
  private endpoint: string;
  */

  constructor(@Optional() private readonly configService?: ConfigService) {
    // TODO: VERCEL_BLOB_MIGRATION
    // Legacy AWS S3 configuration retained temporarily for rollback/reference.
    // AWS_S3_BUCKET_NAME
    // AWS_S3_ENDPOINT
    // AWS_REGION
    // AWS_ACCESS_KEY_ID
    // AWS_SECRET_ACCESS_KEY
    /*
    const bucket = process.env['AWS_S3_BUCKET_NAME'];
    const endpoint = process.env['AWS_S3_ENDPOINT'];

    if (!bucket) {
      throw new Error('AWS_S3_BUCKET_NAME is not defined');
    }

    if (!endpoint) {
      throw new Error('AWS_S3_ENDPOINT is not defined');
    }

    this.bucketName = bucket;
    this.endpoint = endpoint;

    this.s3Client = new S3Client({
      region: process.env['AWS_REGION'] || 'auto',
      endpoint: endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
      },
    });

    console.log('BUCKET:', process.env['AWS_S3_BUCKET_NAME']);
    console.log('ENDPOINT:', process.env['AWS_S3_ENDPOINT']);
    */
  }

  /**
   * Retrieves the BLOB_READ_WRITE_TOKEN from ConfigService or process.env.
   * Throws a clear InternalServerErrorException if unconfigured.
   */
  private getBlobToken(): string {
    const token =
      this.configService?.get<string>('BLOB_READ_WRITE_TOKEN') ||
      process.env['BLOB_READ_WRITE_TOKEN'];

    if (!token || token.trim() === '') {
      throw new InternalServerErrorException(
        'BLOB_READ_WRITE_TOKEN is not configured. Please set the BLOB_READ_WRITE_TOKEN environment variable.',
      );
    }

    return token.trim();
  }

  /**
   * Checks whether the provided URL belongs to Vercel Blob storage.
   */
  isVercelBlobUrl(url?: string | null): boolean {
    if (!url || typeof url !== 'string') return false;
    return (
      url.includes('blob.vercel-storage.com') ||
      url.includes('vercel-storage.com')
    );
  }

  /**
   * Safely extracts file extension with a leading dot.
   */
  private extractSafeExtension(originalName?: string): string {
    if (!originalName) return '.jpg';
    const lastDotIndex = originalName.lastIndexOf('.');
    if (lastDotIndex === -1) return '';
    const rawExt = originalName.substring(lastDotIndex).toLowerCase();
    const cleanExt = rawExt.replace(/[^a-z0-9.]/g, '');
    return cleanExt || '.jpg';
  }

  // TODO: VERCEL_BLOB_MIGRATION
  // Legacy AWS S3 implementation retained for rollback/reference.
  /*
  private getFileUrl(key: string): string {
    const isLocalStack =
      this.endpoint.includes('localhost') ||
      this.endpoint.includes('127.0.0.1');

    if (isLocalStack) {
      return `${this.endpoint}/${this.bucketName}/${key}`;
    }

    return `https://${this.bucketName}.s3.${process.env['AWS_REGION']}.amazonaws.com/${key}`;
  }

  async uploadFile(key: string, fileBuffer: Buffer, contentType: string) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await this.s3Client.send(command);

    return this.getFileUrl(key);
  }
  */

  // Active Vercel Blob implementation
  async uploadFile(
    pathname: string,
    fileBuffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const token = this.getBlobToken();

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('File buffer cannot be empty');
    }

    try {
      const blob = await put(pathname, fileBuffer, {
        access: 'public',
        contentType,
        token,
      });

      return blob.url;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Vercel Blob upload failed for pathname "${pathname}":`, error);
      throw new InternalServerErrorException(
        `Failed to upload file to storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // TODO: VERCEL_BLOB_MIGRATION
  // Legacy AWS S3 implementation retained for rollback/reference.
  /*
  async getFile(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return this.s3Client.send(command);
  }
  */

  // TODO: VERCEL_BLOB_MIGRATION
  // Legacy AWS S3 implementation retained for rollback/reference.
  /*
  async uploadFileHelper(
    userId: string | number,
    fieldName: string,
    files?: Express.Multer.File[],
  ): Promise<string | undefined> {
    if (!files || files.length === 0) return undefined;
    const file = files[0];
    const parts = file.originalname.split('.');
    const ext = parts.length > 1 ? `.${parts.pop()}` : '';
    const key = `technicians/${userId}/${fieldName}-${Date.now()}${ext}`;
    return this.uploadFile(key, file.buffer, file.mimetype);
  }
  */

  // Active Vercel Blob implementation
  async uploadFileHelper(
    userId: string | number,
    fieldName: string,
    files?: Express.Multer.File[],
  ): Promise<string | undefined> {
    if (!files || files.length === 0) return undefined;
    const file = files[0];
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException(`File for "${fieldName}" cannot be empty`);
    }

    const ext = this.extractSafeExtension(file.originalname);
    const uniqueFileName = `${crypto.randomUUID()}${ext}`;
    const folder =
      fieldName === 'profileImage'
        ? `profile-images/${userId}`
        : `documents/${fieldName}/${userId}`;
    const pathname = `${folder}/${uniqueFileName}`;

    return this.uploadFile(pathname, file.buffer, file.mimetype || 'application/octet-stream');
  }

  /**
   * Upload a profile image to Vercel Blob with structured path:
   * profile-images/{userId}/{uuid}{ext}
   */
  async uploadProfileImage(
    userId: string | number,
    file: Express.Multer.File,
  ): Promise<string> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('A valid non-empty file is required');
    }
    const ext = this.extractSafeExtension(file.originalname);
    const uniqueFileName = `${crypto.randomUUID()}${ext}`;
    const pathname = `profile-images/${userId}/${uniqueFileName}`;
    return this.uploadFile(pathname, file.buffer, file.mimetype || 'application/octet-stream');
  }

  // TODO: VERCEL_BLOB_MIGRATION
  // Legacy AWS S3 implementation retained for rollback/reference.
  /*
  async deleteFile(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return this.s3Client.send(command);
  }
  */

  // Active Vercel Blob implementation
  async deleteFile(urlOrKey: string): Promise<void> {
    if (!urlOrKey) {
      throw new BadRequestException('URL or key is required for deletion');
    }

    if (this.isVercelBlobUrl(urlOrKey)) {
      try {
        const token = this.getBlobToken();
        await del(urlOrKey, { token });
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        this.logger.error(`Failed to delete blob from Vercel Blob: ${urlOrKey}`, error);
        throw new InternalServerErrorException(
          `Failed to delete blob from storage: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }

    this.logger.warn(`Skipping delete for non-Vercel Blob URL/key: ${urlOrKey}`);
  }

  // TODO: VERCEL_BLOB_MIGRATION
  // Legacy AWS S3 implementation retained for rollback/reference.
  /*
  async generatePreSignedUrl(key: string, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn,
    });
  }

  async generateUploadUrl(
    key: string,
    contentType = 'application/octet-stream',
    expiresIn = 300,
  ) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn,
    });
  }
  */

  // TODO: VERCEL_BLOB_MIGRATION
  // Legacy AWS S3 implementation retained for rollback/reference.
  /*
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);

      return this.getFileUrl(key);
    } catch (error) {
      console.error('S3 uploadBuffer failed:', error);

      throw new Error('Failed to upload file');
    }
  }
  */

  // Active Vercel Blob implementation
  async uploadBuffer(
    pathname: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    return this.uploadFile(pathname, buffer, contentType);
  }

  // TODO: VERCEL_BLOB_MIGRATION
  // Legacy AWS S3 implementation retained for rollback/reference.
  /*
  async getDownloadUrl(fileKey: string): Promise<string> {
    if (!fileKey) {
      throw new Error('File key is required');
    }

    const normalizedKey = this.normalizeS3Key(fileKey);

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: normalizedKey,
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn: 60 * 60,
    });
  }

  async getAttachmentDownloadUrl(fileKey: string): Promise<string> {
    if (!fileKey) {
      throw new Error('File key is required');
    }

    const normalizedKey = this.normalizeS3Key(fileKey);

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: normalizedKey,
      ResponseContentDisposition: 'attachment',
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn: 60 * 60,
    });
  }

  async getS3DownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }
  */

  // Active Vercel Blob implementation
  async getDownloadUrl(fileKey?: string | null): Promise<string> {
    if (!fileKey) {
      return '';
    }

    // Public Vercel Blob URLs or existing external URLs (e.g. S3 URLs) are returned directly
    if (this.isVercelBlobUrl(fileKey) || fileKey.startsWith('http://') || fileKey.startsWith('https://')) {
      return fileKey;
    }

    return fileKey;
  }

  async getAttachmentDownloadUrl(fileKey?: string | null): Promise<string> {
    if (!fileKey) {
      return '';
    }
    return fileKey;
  }

  // TODO: VERCEL_BLOB_MIGRATION
  // Legacy AWS S3 implementation retained for rollback/reference.
  /*
  async deleteObject(key: string) {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }
  */

  // Active Vercel Blob implementation
  async deleteObject(keyOrUrl: string): Promise<void> {
    await this.deleteFile(keyOrUrl);
  }

  // TODO: VERCEL_BLOB_MIGRATION
  // Legacy AWS S3 implementation retained for rollback/reference.
  /*
  async deleteByUrl(url: string): Promise<void> {
    try {
      const key = this.normalizeS3Key(url);
      await this.deleteObject(key);
    } catch (err) {
      console.error('[S3Service] deleteByUrl failed (non-fatal):', url, err);
    }
  }
  */

  // Active Vercel Blob implementation
  async deleteByUrl(url?: string | null): Promise<void> {
    if (!url) return;

    // Distinguish between Vercel Blob URLs and legacy S3 URLs:
    // Only delete through Vercel Blob if the URL belongs to Vercel Blob storage.
    if (this.isVercelBlobUrl(url)) {
      try {
        const token = this.getBlobToken();
        await del(url, { token });
      } catch (err) {
        this.logger.error(`[S3Service] deleteByUrl failed (non-fatal): ${url}`, err);
      }
      return;
    }

    // Do NOT call del() against legacy S3 URLs
    this.logger.log(`[S3Service] Skipping deletion for non-Blob URL: ${url}`);
  }

  // TODO: VERCEL_BLOB_MIGRATION
  // Legacy AWS S3 implementation retained for rollback/reference.
  /*
  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      const normalizedSourceKey = this.normalizeS3Key(sourceKey);

      const command = new CopyObjectCommand({
        Bucket: this.bucketName,

        CopySource: `${this.bucketName}/${normalizedSourceKey}`,

        Key: destinationKey,

        ContentDisposition: 'attachment',
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('copyObject failed', error);

      throw new InternalServerErrorException('Failed to copy object');
    }
  }
  */

  async downloadPdfFromUrl(url: string): Promise<string> {
    const tempDir = path.join(process.cwd(), 'tmp');

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const filePath = path.join(tempDir, `pdf-${Date.now()}.pdf`);

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
    });

    fs.writeFileSync(filePath, response.data);

    return filePath;
  }

  private normalizeS3Key(value: string): string {
    if (!value.startsWith('http')) {
      return value;
    }

    const url = new URL(value);
    let key = decodeURIComponent(url.pathname.slice(1));

    return key;
  }
}
