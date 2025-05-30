import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { Wallet } from './entities/wallet.entity';
import { ExternalWalletsController } from './external-wallet.controller';
import { ExternalWalletsService } from './external-wallet.service';
import { ExternalWallet } from './entities/external-wallet.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Wallet, ExternalWallet])],
    controllers: [WalletController, ExternalWalletsController],
    providers: [WalletService, ExternalWalletsService],
    exports: [WalletService],
})
export class WalletModule {} 