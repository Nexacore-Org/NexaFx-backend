import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { ScheduledTransfer } from './entities/scheduled-transfer.entity';
import { TransactionsModule } from '../transactions/transactions.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { FeeModule } from '../fees/fee.module';
import { UserModule } from '../user/user.module';
import { WalletModule } from '../wallet/wallet.module';
import { ScheduledTransfersController } from './controllers/scheduled-transfers.controller';
import { ScheduledTransfersService } from './providers/transfers.service';
import { TransferValidationMiddleware } from './middleware/transfer-validation.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledTransfer]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    TransactionsModule,
    CurrenciesModule,
    FeeModule,
    UserModule,
    WalletModule,
  ],
  controllers: [ScheduledTransfersController],
  providers: [ScheduledTransfersService],
  exports: [ScheduledTransfersService],
})
export class TransfersModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TransferValidationMiddleware)
      .forRoutes('transfers/middleware/transfer-validation.middleware.ts');
  }
}
