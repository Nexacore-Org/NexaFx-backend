import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from './storage.service';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    this.bucketName = process.env.S3_BUCKET_NAME || '';
  }

  async upload(file: Express.Multer.File, pathParam: string): Promise<string> {
    const env = process.env.NODE_ENV || 'development';
    
    // Secure naming
    const fileExt = path.extname(file.originalname).toLowerCase();
    const safeFilename = `${uuidv4()}${fileExt}`;
    const relativeKey = `${env}/${pathParam}/${safeFilename}`.replace(/\\/g, '/');

    this.logger.log(`Uploading to S3 bucket ${this.bucketName}: ${relativeKey}`);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: relativeKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return relativeKey;
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    this.logger.log(`Deleting from S3 bucket ${this.bucketName}: ${key}`);

    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }
}
