import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { KYCApplication } from './entities/kyc-application.entity';
import { KycEmailService } from './kyc-email.service';
import { KycGuard } from '../common/guards/kyc.guard';
import { User } from '../users/user.entity';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { StorageModule } from '../modules/storage/storage.module';
import { forwardRef } from '@nestjs/common';
import { SanctionsModule } from '../sanctions/sanctions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KYCApplication, User]),
    WebhooksModule,
    MulterModule.register({
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB for video selfies
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
    TypeOrmModule.forFeature([KYCApplication]),
  ],
})
export class KycModule {}
