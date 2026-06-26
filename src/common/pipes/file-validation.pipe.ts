import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { fromBuffer } from 'file-type';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

const ALLOWED_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class FileValidationPipe implements PipeTransform {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async transform(value: unknown, _metadata: ArgumentMetadata) {
    if (!value) {
      return value;
    }

    // Handle both single file and record of file arrays
    if (typeof value === 'object' && value !== null) {
      const filesMap = value as Record<string, Express.Multer.File[]>;
      for (const fieldName of Object.keys(filesMap)) {
        const fileArr = filesMap[fieldName];
        if (Array.isArray(fileArr)) {
          for (const file of fileArr) {
            await this.validateFile(file, fieldName);
          }
        }
      }
    }

    return value;
  }

  private async validateFile(
    file: Express.Multer.File,
    fieldName: string,
  ): Promise<void> {
    if (!file || !file.buffer) {
      return;
    }

    // Enforce max size (in case multer limits are bypassed)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File "${fieldName}" exceeds the 5 MB size limit`,
      );
    }

    // Detect actual MIME type from magic bytes - do NOT trust Content-Type header
    const detected = await fromBuffer(file.buffer);

    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new BadRequestException(
        `File "${fieldName}" has an invalid or unsupported format. ` +
          `Allowed types: image/jpeg, image/png, application/pdf`,
      );
    }

    // Patch the mimetype on the file object with the actual detected MIME
    file.mimetype = detected.mime;

    // Also set the correct extension on the originalname so downstream code picks it up
    const correctExt = ALLOWED_EXTENSIONS[detected.mime];
    file.originalname = `${fieldName}${correctExt}`;
  }
}
