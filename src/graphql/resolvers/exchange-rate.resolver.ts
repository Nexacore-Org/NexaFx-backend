import { Resolver, Query, Args } from '@nestjs/graphql';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { CurrenciesService } from '../../currencies/currencies.service';

@Resolver()
export class ExchangeRateResolver {
  constructor(
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly currenciesService: CurrenciesService,
  ) {}

  @Query('exchangeRate')
  async exchangeRate(
    @Args('from') from: string,
    @Args('to') to: string,
  ) {
    const result = await this.exchangeRatesService.getRate(from, to);
    return {
      from: result.from,
      to: result.to,
      rate: result.rate,
      timestamp: result.fetchedAt ?? new Date().toISOString(),
    };
  }

  @Query('currencies')
  async currencies() {
    return this.currenciesService.findAll();
  }
}
