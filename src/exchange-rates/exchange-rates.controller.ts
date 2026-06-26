import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { ExchangeRatesService, ExchangeRateResponseDto } from './exchange-rates.service';
import { Public } from '../auth/decorators/public.decorator';
import { CurrenciesService } from '../currencies/currencies.service';
import { RedisService } from '../common/services/redis.service';

@ApiTags('Exchange Rates')
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly currenciesService: CurrenciesService,
    private readonly redisService: RedisService,
  ) {}

  @Public()
  @Get('currencies')
  @ApiOperation({ summary: 'Get all active currencies' })
  @ApiResponse({
    status: 200,
    description: 'List of all active currencies',
  })
  async getCurrencies() {
    const cacheKey = 'exchange_rates_currencies';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return cached;
    }
    const currencies = await this.currenciesService.findAll(true);
    await this.redisService.set(cacheKey, currencies, 3600); // 1h TTL
    return currencies;
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get exchange rate for a currency pair' })
  @ApiQuery({ name: 'from', required: true, example: 'XLM' })
  @ApiQuery({ name: 'to', required: true, example: 'NGN' })
  @ApiResponse({ status: 200, description: 'Exchange rate retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid currency code' })
  @ApiResponse({ status: 503, description: 'Exchange rate provider unavailable' })
  async getRate(
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<ExchangeRateResponseDto> {
    return this.exchangeRatesService.getRate(from, to);
  }

  @Public()
  @Get('currencies')
  @ApiOperation({ summary: 'Get supported currency pairs configured by provider' })
  @ApiResponse({ status: 200, description: 'Supported currency pairs returned successfully' })
  async getCurrencies(): Promise<string[]> {
    return this.exchangeRatesService.getSupportedPairs();
  }

  @Public()
  @Get('history')
  @ApiOperation({ summary: 'Get daily historical OHLC data' })
  @ApiQuery({ name: 'from', required: true, example: 'XLM' })
  @ApiQuery({ name: 'to', required: true, example: 'NGN' })
  @ApiQuery({ name: 'days', required: false, example: '7' })
  @ApiResponse({ status: 200, description: 'Historical OHLC data returned successfully' })
  async getHistory(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ): Promise<any[]> {
    return this.exchangeRatesService.getDailyOHLCHistory(from, to, days);
  }
}
