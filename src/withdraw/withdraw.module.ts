import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../user/entities/user.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { WithdrawController } from './controllers/withdraw.controller';
import { WithdrawService } from './providers/withdraw.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, User, Currency]),
    NotificationsModule,
  ],
  controllers: [WithdrawController],
  providers: [WithdrawService],
  exports: [WithdrawService],
})
export class WithdrawModule {}
