import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FiatService } from './fiat.service';
import { FiatController } from './fiat.controller';
import { FiatDeposit } from './entities/fiat-deposit.entity';
import { FiatWithdrawal } from './entities/fiat-withdrawal.entity';
import { User } from '../../users/user.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { KycRecord } from '../../kyc/entities/kyc.entity';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      FiatDeposit,
      FiatWithdrawal,
      User,
      Wallet,
      KycRecord,
    ]),
    NotificationsModule,
  ],
  controllers: [FiatController],
  providers: [FiatService],
  exports: [FiatService],
})
export class FiatModule {}
