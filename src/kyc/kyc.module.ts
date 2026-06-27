import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { KycApplication } from './entities/kyc-application.entity';
import { KycEmailService } from './kyc-email.service';
import { KycGuard } from '../common/guards/kyc.guard';
import { User } from '../users/user.entity';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { StorageModule } from '../modules/storage/storage.module';
import { forwardRef } from '@nestjs/common';
import { SanctionsModule } from '../sanctions/sanctions.module';
import { join } from 'path';
import * as fs from 'fs';
import type { Request } from 'express';
import { randomUUID } from 'crypto';

function isMulterFile(x: unknown): x is Express.Multer.File {
  if (typeof x !== 'object' || x === null) return false;
  const rec = x as Record<string, unknown>;
  return (
    typeof rec.originalname === 'string' && typeof rec.mimetype === 'string'
  );
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
];

@Module({
  imports: [
    TypeOrmModule.forFeature([KycApplication, User]),
    WebhooksModule,
    MulterModule.register({
      storage: diskStorage({
        destination: (
          req: Request & {
            user?: { userId?: string };
            kycUploadVersion?: string;
          },
          _file: unknown,
          cb: (err: Error | null, destination: string) => void,
        ) => {
          try {
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
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
    StorageModule,
    forwardRef(() => SanctionsModule),
  ],
  controllers: [KycController],
  providers: [KycService, KycEmailService, KycGuard],
  exports: [
    KycService,
    KycEmailService,
    KycGuard,
    TypeOrmModule.forFeature([KycApplication]),
  ],
})
export class KycModule {}
