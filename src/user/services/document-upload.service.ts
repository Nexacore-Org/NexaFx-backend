import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DocumentUploadService {
  private readonly uploadDir: string;
  private readonly allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  private readonly maxFileSize: number;

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR') || './uploads/documents';
    this.maxFileSize = Number(this.configService.get<number>('MAX_FILE_SIZE')) || 5 * 1024 * 1024;
    void this.ensureUploadDirExists();
  }

  private async ensureUploadDirExists() {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  async uploadDocument(file: Express.Multer.File): Promise<string> {
    if (!file) throw new BadRequestException('No file uploaded');

    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only PDF, JPG, and PNG files are allowed.');
    }
    if (file.size > this.maxFileSize) {
      throw new BadRequestException('File size exceeds 5MB limit.');
    }

    const fileExtension = path.extname(file.originalname);
    const uniqueFilename = `${uuidv4()}${fileExtension}`;
    const filepath = path.join(this.uploadDir, uniqueFilename);
    await fs.writeFile(filepath, file.buffer);
    return `/documents/${uniqueFilename}`;
  }

  async deleteDocument(filename: string): Promise<void> {
    const filepath = path.join(this.uploadDir, filename);
    await fs.unlink(filepath);
  }
}


