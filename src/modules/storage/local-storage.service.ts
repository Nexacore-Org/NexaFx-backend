import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { StorageService } from './storage.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ALLOWED_FILE_TYPES } from '../../common/constants/allowed-file-types';
import { getStorageSigningSecret } from './storage-signing-secret';

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadsBase = path.resolve(process.cwd(), 'uploads');

  async upload(file: Express.Multer.File, pathParam: string): Promise<string> {
    const env = process.env.NODE_ENV || 'development';
    const fileType = ALLOWED_FILE_TYPES[file.mimetype];
    if (!fileType) {
      throw new BadRequestException('Unsupported file type');
    }

    const targetDir = path.resolve(this.uploadsBase, env, pathParam);
    if (!this.isInsideUploads(targetDir)) {
      throw new BadRequestException('Path traversal detected');
    }

    await fs.promises.mkdir(targetDir, { recursive: true });

    const safeFilename = `${uuidv4()}${fileType.extension}`;
    const fullPath = path.join(targetDir, safeFilename);

    await fs.promises.writeFile(fullPath, file.buffer);

    const relativeKey = path
      .relative(this.uploadsBase, fullPath)
      .split(path.sep)
      .join('/');
    this.logger.log(`Uploaded file to local storage: ${relativeKey}`);

    return relativeKey;
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const fullPath = this.resolveInsideUploads(key);
    const normalizedKey = path
      .relative(this.uploadsBase, fullPath)
      .split(path.sep)
      .join('/');
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;

    const port = process.env.PORT || '3000';
    const baseUrl = process.env.BACKEND_URL || `http://localhost:${port}`;

    const hmac = crypto.createHmac('sha256', getStorageSigningSecret());
    hmac.update(`${normalizedKey}:${expires}`);
    const signature = hmac.digest('hex');

    return `${baseUrl}/uploads/${normalizedKey}?expires=${expires}&signature=${signature}`;
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolveInsideUploads(key);
    try {
      await fs.promises.unlink(fullPath);
      this.logger.log(`Deleted file from local storage: ${key}`);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }
      throw error;
    }
  }

  private resolveInsideUploads(key: string): string {
    const fullPath = path.resolve(this.uploadsBase, key);
    if (!this.isInsideUploads(fullPath)) {
      throw new BadRequestException('Path traversal detected');
    }
    return fullPath;
  }

  private isInsideUploads(targetPath: string): boolean {
    const relativePath = path.relative(this.uploadsBase, targetPath);
    return (
      relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath)
    );
  }
}
