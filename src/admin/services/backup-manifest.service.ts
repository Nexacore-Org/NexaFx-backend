import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

export interface BackupManifest {
  filename: string;
  size: number;
  checksum: string;
  createdAt: string;
  pgVersion: string;
  s3Key?: string;
}

@Injectable()
export class BackupManifestService {
  private readonly logger = new Logger(BackupManifestService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey:
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
    });
    this.bucketName =
      this.configService.get<string>('BACKUP_BUCKET') || '';
  }

  async listRecentManifests(limit = 10): Promise<BackupManifest[]> {
    if (!this.bucketName) {
      this.logger.warn('BACKUP_BUCKET not configured');
      return [];
    }

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'nexafx/manifests/',
      });

      const response = await this.s3Client.send(command);

      if (!response.Contents || response.Contents.length === 0) {
        return [];
      }

      const sorted = response.Contents.sort(
        (a, b) =>
          (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
      );

      const recent = sorted.slice(0, limit);

      const manifests: BackupManifest[] = [];

      for (const obj of recent) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: obj.Key!,
          });

          const getResponse = await this.s3Client.send(getCommand);
          const body = await getResponse.Body?.transformToString();

          if (body) {
            const parsed: BackupManifest = JSON.parse(body);
            manifests.push({
              ...parsed,
              s3Key: obj.Key,
            });
          }
        } catch (err) {
          this.logger.warn(
            `Failed to read manifest ${obj.Key}: ${(err as Error).message}`,
          );
        }
      }

      return manifests;
    } catch (error) {
      this.logger.error(
        `Failed to list backup manifests: ${(error as Error).message}`,
      );
      return [];
    }
  }
}
