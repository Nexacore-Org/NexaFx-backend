import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GdprConsent } from './entities/gdpr-consent.entity';
import { GdprService } from './gdpr.service';

import { GdprController } from './gdpr.controller';
import { User } from '../../users/user.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { KycRecord } from '../../kyc/entities/kyc.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { RateAlert } from '../../rate-alerts/entities/rate-alert.entity';
import { WebhookEndpoint } from '../../webhooks/entities/webhook-endpoint.entity';
import { WebhookDelivery } from '../../webhooks/entities/webhook-delivery.entity';
import { AuditLog } from '../../audit-logs/entities/audit-log.entity';
import { RefreshToken } from '../../tokens/refresh-token.entity';
import { BullModule } from '@nestjs/bullmq';
import { ExportProcessor } from './processors/export.processor';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { LedgerEntry } from '../../ledger/entities/ledger-entry.entity';
import { Referral } from '../../referrals/entities/referral.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GdprConsent,
      User,
      Transaction,
      KycRecord,
      Notification,
      RateAlert,
      WebhookEndpoint,
      WebhookDelivery,
      AuditLog,
      RefreshToken,
      Wallet,
      LedgerEntry,
      Referral,
    ]),
    BullModule.registerQueue({
      name: 'gdpr-export',
    }),
  ],
  controllers: [GdprController],
  providers: [GdprService, ExportProcessor],
  exports: [GdprService],
})
export class GdprModule {}
