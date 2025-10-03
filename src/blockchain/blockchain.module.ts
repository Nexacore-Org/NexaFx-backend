import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BlockchainController } from './controllers/blockchain.controller';
import { WebhookController } from './controllers/webhook.controller';
import { ContractService } from './services/contract.service';
import { WalletService } from './services/wallet.service';
import { TransferService } from './services/transfer.service';
import { StellarService } from './services/stellar.service';
import { HorizonService } from './services/horizon/horizon.service';
import { WebhookService } from './services/webhook.service';
import { ContractTransaction } from './entities/contract-transaction.entity';
import { BlockchainWallet } from './entities/wallet.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import contractConfig from './config/contract.config';

@Module({
  imports: [
    ConfigModule.forFeature(contractConfig),
    TypeOrmModule.forFeature([
      ContractTransaction,
      BlockchainWallet,
      Transaction,
    ]),
    CacheModule.register(),
  ],
  controllers: [BlockchainController, WebhookController],
  providers: [
    ContractService,
    WalletService,
    TransferService,
    StellarService,
    HorizonService,
    WebhookService,
  ],
  exports: [
    ContractService,
    WalletService,
    TransferService,
    StellarService,
    HorizonService,
  ],
})
export class BlockchainModule { }