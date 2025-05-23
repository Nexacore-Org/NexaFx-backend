import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { Wallet } from './entities/wallet.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Wallet])],
    controllers: [WalletController],
    providers: [WalletService],
    exports: [WalletService],
})
export class WalletModule {} 