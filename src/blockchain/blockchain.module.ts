import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StellarService } from './services/stellar.service';
import { WebhookService } from './services/webhook.service';
import { BlockchainController } from './controllers/blockchain.controller';
import { WebhookController } from './controllers/webhook.controller';
import { Transaction } from '../transactions/entities/transaction.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Transaction])],
  providers: [StellarService, WebhookService],
  controllers: [BlockchainController, WebhookController],
  exports: [StellarService, WebhookService],
})
export class BlockchainModule {}
