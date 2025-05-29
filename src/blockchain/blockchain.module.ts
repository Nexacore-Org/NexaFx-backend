import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StellarService } from './services/stellar.service';
import { WebhookService } from './services/webhook.service';
import { BlockchainController } from './controllers/blockchain.controller';
import { WebhookController } from './controllers/webhook.controller';
import { Transaction } from '../transactions/entities/transaction.entity';
import { HorizonService } from './services/horizon/horizon.service';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Transaction]),
    CacheModule.register(),
  ],
  providers: [StellarService, WebhookService, HorizonService],
  controllers: [BlockchainController, WebhookController],
  exports: [StellarService, WebhookService, HorizonService],
})
export class BlockchainModule {}
