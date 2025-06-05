import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { Wallet } from './entities/wallet.entity';
import { ExternalWalletsController } from './external-wallet.controller';
import { ExternalWalletsService } from './external-wallet.service';
import { ExternalWallet } from './entities/external-wallet.entity';
import { User } from '../user/entities/user.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { BlockchainModule } from 'src/blockchain/blockchain.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, ExternalWallet, User, Currency]),
    BlockchainModule,
  ],
  controllers: [WalletController, ExternalWalletsController],
  providers: [WalletService, ExternalWalletsService],
  exports: [WalletService],
})
export class WalletModule {}
