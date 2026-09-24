import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgrammablePaymentRulesController } from './programmable-payment-rules.controller';
import { ProgrammablePaymentRulesService } from './programmable-payment-rules.service';
import { PaymentRule } from './entities/payment-rule.entity';
import { WalletsModule } from '../wallets/wallets.module';
import { TransactionsModule } from '../transactions/transaction.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentRule]),
    WalletsModule,
    TransactionsModule,
    NotificationsModule,
  ],
  controllers: [ProgrammablePaymentRulesController],
  providers: [ProgrammablePaymentRulesService],
  exports: [ProgrammablePaymentRulesService],
})
export class ProgrammablePaymentRulesModule {}
