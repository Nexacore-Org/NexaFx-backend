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

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const ALLOWED_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB for images/docs
const MAX_VIDEO_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB for video selfies

@Injectable()
export class FileValidationPipe implements PipeTransform {
  async transform(value: unknown, _metadata: ArgumentMetadata) {
    if (!value) {
      return value;
    }

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

    const isVideoField =
      fieldName === 'videoSelfie' ||
      (file.mimetype && ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype));

    const maxSize = isVideoField
      ? MAX_VIDEO_FILE_SIZE_BYTES
      : MAX_FILE_SIZE_BYTES;
    const allowedTypes = isVideoField
      ? ALLOWED_VIDEO_MIME_TYPES
      : ALLOWED_MIME_TYPES;

    if (file.size > maxSize) {
      throw new BadRequestException(
        `File "${fieldName}" exceeds the ${isVideoField ? '50 MB' : '5 MB'} size limit`,
      );
    }

    const detected = await fromBuffer(file.buffer);

    if (!detected || !allowedTypes.has(detected.mime)) {
      const allowedList = Array.from(allowedTypes).join(', ');
      throw new BadRequestException(
        `File "${fieldName}" has an invalid or unsupported format. Allowed types: ${allowedList}`,
      );
    }

    file.mimetype = detected.mime;

    const correctExt = ALLOWED_EXTENSIONS[detected.mime];
    if (correctExt) {
      file.originalname = `${fieldName}${correctExt}`;
    }
  }
}
