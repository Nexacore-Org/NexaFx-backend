import { Controller, Get, Param } from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { Currency } from './currency.entity';
import { Public } from '../auth/decorators/public.decorator';

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  /**
   * GET /currencies
   * Returns all supported currencies
   */
  @Public()
  @Get()
  async findAll(): Promise<Currency[]> {
    return this.currenciesService.findAll();
  }

  /**
   * GET /currencies/base
   * Returns the base currency (NGN)
   */
  @Public()
  @Get('base')
  async getBaseCurrency(): Promise<Currency> {
    return this.currenciesService.getBaseCurrency();
  }

  /**
   * GET /currencies/:code
   * Returns a specific currency by code
   * @param code - Currency code (e.g., 'NGN', 'USD')
   */
  @Public()
  @Get(':code')
  async getCurrency(@Param('code') code: string): Promise<Currency> {
    return this.currenciesService.getCurrency(code);
  }
}
