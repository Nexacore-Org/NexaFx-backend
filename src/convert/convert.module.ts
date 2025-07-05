import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Transaction } from "../transactions/entities/transaction.entity"
import { User } from "../user/entities/user.entity"
import { Currency } from "../currencies/entities/currency.entity"
import { NotificationsModule } from "../notifications/notifications.module"
import { CurrenciesModule } from "../currencies/currencies.module"
import { ConvertController } from "./controllers/convert.controller"
import { ConvertService } from "./providers/convert.service"

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, User, Currency]), NotificationsModule, CurrenciesModule],
  controllers: [ConvertController],
  providers: [ConvertService],
  exports: [ConvertService],
})
export class ConvertModule {}
