import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { ExchangeRatesService } from './exchange-rates.service';
import {
  ExchangeRateQueryDto,
  ExchangeRateResponseDto,
} from './dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Exchange Rates')
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get exchange rate for a currency pair' })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Base currency code (ISO 4217)',
    example: 'NGN',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Target currency code (ISO 4217)',
    example: 'USD',
  })
  @ApiResponse({
    status: 200,
    description: 'Exchange rate retrieved successfully',
    type: ExchangeRateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid currency code or query parameters',
  })
  @ApiResponse({
    status: 502,
    description: 'Exchange rate provider error',
  })
  async getRate(
    @Query() query: ExchangeRateQueryDto,
  ): Promise<ExchangeRateResponseDto> {
    return this.exchangeRatesService.getRate(query.from, query.to);
  }
}
