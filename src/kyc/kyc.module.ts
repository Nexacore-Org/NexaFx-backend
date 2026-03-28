/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Module, BadRequestException } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { KycRecord } from './entities/kyc.entity';
import { User } from '../users/user.entity';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import * as fs from 'fs';
import type { Request } from 'express';
import { randomUUID } from 'crypto';

// runtime type guard to satisfy strict ESLint rules about unsafe member access
function isMulterFile(x: unknown): x is Express.Multer.File {
  if (typeof x !== 'object' || x === null) return false;
  const rec = x as Record<string, unknown>;
  return (
    typeof rec.originalname === 'string' && typeof rec.mimetype === 'string'
  );
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

@Module({
  imports: [
    TypeOrmModule.forFeature([KycRecord, User]),
    MulterModule.register({
      storage: diskStorage({
        destination: (
          req: Request & {
            user?: { userId?: string };
            kycUploadVersion?: string;
          },
          file: unknown,
          cb: (err: Error | null, destination: string) => void,
        ) => {
          try {
            // versioned folder per submission to avoid orphaning
            const userId = req.user?.userId ?? 'anonymous';
            const version = Date.now().toString();
            const uploadPath = join(
              process.cwd(),
              'uploads',
              'kyc',
              userId,
              version,
            );
            fs.mkdirSync(uploadPath, { recursive: true });
            // expose version to controller through request
            req.kycUploadVersion = version;
            cb(null, uploadPath);
          } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            cb(e, '');
          }
        },
        filename: (
          _req: Request,
          file: unknown,
          cb: (err: Error | null, filename: string) => void,
        ) => {
          if (!isMulterFile(file)) {
            // if file isn't shaped like a Multer file, reject with a generated name
            return cb(
              new BadRequestException('Invalid file uploaded'),
              `${randomUUID()}`,
            );
          }
          const multerFile = file;
          const original = multerFile.originalname ?? '';
          const idx = original.lastIndexOf('.');
          const ext = idx >= 0 ? original.substring(idx) : '';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      fileFilter: (
        _req: Request,
        file: unknown,
        cb: (err: Error | null, acceptFile: boolean) => void,
      ) => {
        if (!isMulterFile(file)) {
          return cb(new BadRequestException('Invalid file uploaded'), false);
        }
        const multerFile = file;
        const mimetype = multerFile.mimetype ?? '';
        if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
          return cb(
            new BadRequestException(
              `Invalid file type: ${mimetype}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  ],
  controllers: [KycController],
  providers: [KycService],
})
export class KycModule {}
