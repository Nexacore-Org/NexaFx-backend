import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostBasisLot } from './entities/cost-basis-lot.entity';
import { TaxEvent } from './entities/tax-event.entity';
import { PriceSnapshot } from './entities/price-snapshot.entity';
import { TaxExportJob } from './entities/tax-export-job.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { QueuesModule } from '../modules/queues/queues.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { TaxService } from './tax.service';
import { TaxProcessor } from './tax.processor';
import { TaxController } from './tax.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CostBasisLot,
      TaxEvent,
      PriceSnapshot,
      TaxExportJob,
      Transaction,
    ]),
    QueuesModule,
    ExchangeRatesModule,
  ],
  controllers: [TaxController],
  providers: [TaxService, TaxProcessor],
  exports: [TaxService],
})
export class TaxModule {}
