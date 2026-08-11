// TODO: For utho s3 code
import { Injectable, InternalServerErrorException } from '@nestjs/common';

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

import { MulterFile } from '@poojawala/dtos';

// TODO: For utho s3 code
@Injectable()
export class S3Service {
  private s3Client: S3Client;

  private bucketName: string;

  private endpoint: string;

  constructor() {
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
  }

  private getFileUrl(key: string): string {
    const isLocalStack =
      this.endpoint.includes('localhost') ||
      this.endpoint.includes('127.0.0.1');

    // Local MinIO uses path-style: http://localhost:9000/bucket/key
    // Real AWS uses subdomain-style: https://bucket.s3.region.amazonaws.com/key
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

  async getFile(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return this.s3Client.send(command);
  }

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

  async deleteFile(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return this.s3Client.send(command);
  }

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

  async deleteObject(key: string) {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }

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

    if (key.startsWith(`${this.bucketName}/`)) {
      key = key.slice(this.bucketName.length + 1);
    }

    return key;
  }
}
