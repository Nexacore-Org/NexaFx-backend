import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import {
  StorageService,
  getStorageSigningSecret,
  resolveValidatedStorageType,
} from './storage.service';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadsBase = path.resolve(process.cwd(), 'uploads');

  private assertWithinUploadsBase(targetPath: string): string {
    const resolvedBase = path.resolve(this.uploadsBase);
    const resolvedTarget = path.resolve(targetPath);
    const relative = path.relative(resolvedBase, resolvedTarget);

    if (
      !relative ||
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !resolvedTarget.startsWith(resolvedBase + path.sep)
    ) {
      throw new BadRequestException('Path traversal detected');
    }

    return resolvedTarget;
  }

  async upload(file: Express.Multer.File, pathParam: string): Promise<string> {
    const env = process.env.NODE_ENV || 'development';

    const targetDir = this.assertWithinUploadsBase(
      path.resolve(this.uploadsBase, env, pathParam),
    );

    const { extension } = await resolveValidatedStorageType(file);
    const safeFilename = `${crypto.randomUUID()}${extension}`;
    const fullPath = this.assertWithinUploadsBase(
      path.join(targetDir, safeFilename),
    );

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(fullPath, file.buffer);

    const relativeKey = path
      .relative(this.uploadsBase, fullPath)
      .replace(/\\/g, '/');
    this.logger.log(`Uploaded file to local storage: ${relativeKey}`);

    return relativeKey;
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const fullPath = this.assertWithinUploadsBase(
      path.resolve(this.uploadsBase, key),
    );
    const normalizedKey = path
      .relative(this.uploadsBase, fullPath)
      .replace(/\\/g, '/');
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;

    const port = process.env.PORT || '3000';
    const baseUrl = process.env.BACKEND_URL || `http://localhost:${port}`;

    const secret = getStorageSigningSecret();
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${normalizedKey}:${expires}`);
    const signature = hmac.digest('hex');

    return `${baseUrl}/uploads/${normalizedKey}?expires=${expires}&signature=${signature}`;
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.assertWithinUploadsBase(
      path.resolve(this.uploadsBase, key),
    );

    try {
      await fs.unlink(fullPath);
      this.logger.log(`Deleted file from local storage: ${key}`);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
