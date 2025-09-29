import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../user/entities/user.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { DepositController } from './controllers/deposit.controller';
import { DepositService } from './providers/deposit.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, User, Currency]),
    NotificationsModule,
  ],
  controllers: [DepositController],
  providers: [DepositService],
  exports: [DepositService],
})
export class DepositModule {}
