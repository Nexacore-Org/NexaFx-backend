import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { BankAccountController } from './controllers/bank-account.controller';
import { BankAccountService } from './services/bank-account.service';
import { PaymentRailService } from './services/payment-rail.service';
import { UsersModule } from '../../users/users.module';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { NotificationsModule } from '../../notifications/notifications.module';
import { Notification } from '../../notifications/entities/notification.entity';
import { CurrenciesModule } from '../../currencies/currencies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankAccount, Transaction, Notification]),
    UsersModule,
    NotificationsModule,
    CurrenciesModule,
  ],
  controllers: [BankAccountController],
  providers: [BankAccountService, PaymentRailService],
  exports: [BankAccountService],
})
export class BankingModule {}
