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
