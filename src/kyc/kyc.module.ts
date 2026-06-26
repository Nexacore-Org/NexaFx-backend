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



@Module({
  imports: [
    TypeOrmModule.forFeature([KycRecord, User]),
    WebhooksModule,
    MulterModule.register({
      storage: undefined, // defaults to memoryStorage
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB hard limit
    }),
    StorageModule,
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
