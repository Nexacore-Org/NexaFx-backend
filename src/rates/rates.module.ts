import { Module } from '@nestjs/common';
import { RatesService } from './rates.service';
import { RatesController } from './rates.controller';
import { CurrenciesModule } from '../currencies/currencies.module';

@Module({
  imports: [CurrenciesModule],
  providers: [RatesService],
  controllers: [RatesController],
})
export class RatesModule {}
