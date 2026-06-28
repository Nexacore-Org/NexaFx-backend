import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { KycRecord } from './entities/kyc.entity';
import { KycEmailService } from './kyc-email.service';
import { KycGuard } from '../common/guards/kyc.guard';
import { User } from '../users/user.entity';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { StorageModule } from '../modules/storage/storage.module';
import { forwardRef } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { SanctionsModule } from '../sanctions/sanctions.module';
import { join } from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
];

function isMulterFile(file: unknown): file is Express.Multer.File {
  return typeof file === 'object' && file !== null && 'originalname' in file;
}

// Shared destination builder
function buildDiskDestination(
  req: Request & {
    user?: { userId?: string };
    kycUploadVersion?: string;
  },
  _file: unknown,
  cb: (err: Error | null, destination: string) => void,
): void {
  try {
    const userId = req.user?.userId ?? 'anonymous';
    const version = Date.now().toString();
    const uploadPath = join(process.cwd(), 'uploads', 'kyc', userId, version);
    fs.mkdirSync(uploadPath, { recursive: true });
    req.kycUploadVersion = version;
    cb(null, uploadPath);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    cb(e, '');
  }
}

// Shared filename builder
function buildFilename(
  _req: Request,
  file: unknown,
  cb: (err: Error | null, filename: string) => void,
): void {
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
}

// Shared file type filter
function fileFilter(
  _req: Request,
  file: unknown,
  cb: (err: Error | null, acceptFile: boolean) => void,
): void {
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
}

@Module({
  imports: [
    TypeOrmModule.forFeature([KycRecord, User]),
    WebhooksModule,
    MulterModule.register({
      storage: undefined, // defaults to memoryStorage
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB hard limit
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
    TypeOrmModule.forFeature([KycRecord]),
  ],
})
export class KycModule {}
