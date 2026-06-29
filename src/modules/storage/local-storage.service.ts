import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { StorageService } from './storage.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadsBase = path.resolve(process.cwd(), 'uploads');

  async upload(file: Express.Multer.File, pathParam: string): Promise<string> {
    const env = process.env.NODE_ENV || 'development';
    
    // Prevent path traversal in the directory path
    const targetDir = path.resolve(this.uploadsBase, env, pathParam);
    if (!targetDir.startsWith(this.uploadsBase)) {
      throw new BadRequestException('Path traversal detected');
    }

    // Ensure the folder exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Secure naming
    const fileExt = path.extname(file.originalname).toLowerCase();
    const safeFilename = `${uuidv4()}${fileExt}`;
    const fullPath = path.join(targetDir, safeFilename);

    // Save buffer
    fs.writeFileSync(fullPath, file.buffer);

    const relativeKey = `${env}/${pathParam}/${safeFilename}`.replace(/\\/g, '/');
    this.logger.log(`Uploaded file to local storage: ${relativeKey}`);

    return relativeKey;
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    // Basic sanitization
    const sanitizedKey = key.replace(/\.\./g, '');
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    
    const port = process.env.PORT || '3000';
    const baseUrl = process.env.BACKEND_URL || `http://localhost:${port}`;
    
    const secret = process.env.JWT_SECRET || 'local-secret';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${sanitizedKey}:${expires}`);
    const signature = hmac.digest('hex');

    return `${baseUrl}/uploads/${sanitizedKey}?expires=${expires}&signature=${signature}`;
  }

  async delete(key: string): Promise<void> {
    const sanitizedKey = key.replace(/\.\./g, '');
    const fullPath = path.resolve(this.uploadsBase, sanitizedKey);

    if (!fullPath.startsWith(this.uploadsBase)) {
      throw new BadRequestException('Path traversal detected');
    }

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      this.logger.log(`Deleted file from local storage: ${key}`);
    }
  }
}
