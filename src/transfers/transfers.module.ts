import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { ScheduleModule } from "@nestjs/schedule"
import { EventEmitterModule } from "@nestjs/event-emitter"

import { ScheduledTransfer } from "./entities/scheduled-transfer.entity"
import { TransactionsModule } from "../transactions/transactions.module"
import { CurrenciesModule } from "../currencies/currencies.module"
import { FeeModule } from "../fees/fee.module"
import { UserModule } from "../user/user.module"
import { ScheduledTransfersController } from "./controllers/scheduled-transfers.controller"
import { ScheduledTransfersService } from "./providers/transfers.service"

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledTransfer]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    TransactionsModule,
    CurrenciesModule,
    FeeModule,
    UserModule,
  ],
  controllers: [ScheduledTransfersController],
  providers: [ScheduledTransfersService],
  exports: [ScheduledTransfersService],
})
export class ScheduledTransfersModule {}
