import { Resolver, Query, Args } from '@nestjs/graphql';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { CurrenciesService } from '../../currencies/currencies.service';
import { Currency, ExchangeRate } from '../types/exchange-rate.type';

@Resolver()
export class ExchangeRateResolver {
  constructor(
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly currenciesService: CurrenciesService,
  ) {}

  @Query(() => ExchangeRate, { name: 'exchangeRate' })
  async exchangeRate(
    @Args('from', { type: () => String }) from: string,
    @Args('to', { type: () => String }) to: string,
  ) {
    const result = await this.exchangeRatesService.getRate(from, to);
    return {
      from: result.from,
      to: result.to,
      rate: result.rate,
      timestamp: result.cachedAt ?? new Date().toISOString(),
    };
  }

  @Query(() => [Currency], { name: 'currencies' })
  async currencies() {
    return this.currenciesService.findAll();
  }
}
