import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookService } from './services/webhook.service';
import { WebhookController } from './controllers/webhook.controller';
import { QueuesModule } from '../modules/queues/queues.module';
import { WebhookProcessor } from '../modules/webhooks/webhook.processor';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEndpoint, WebhookDelivery]),
    QueuesModule,
    AuditLogsModule,
  ],
  providers: [WebhookService, WebhookProcessor],
  controllers: [WebhookController],
  exports: [WebhookService],
})
export class WebhooksModule {}
