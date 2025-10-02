import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from '../entities/currency.entity';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_CONFIG,
  getCurrencyConfig,
  getExchangeRate,
} from '../constants/supported-currencies';

@Injectable()
export class CurrencySeederService {
  private readonly logger = new Logger(CurrencySeederService.name);

  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
  ) {}

  async seedCurrencies(): Promise<void> {
    this.logger.log('Starting currency seeding...');

    for (const currencyCode of SUPPORTED_CURRENCIES) {
      await this.seedCurrency(currencyCode);
    }

    this.logger.log('Currency seeding completed');
  }

  private async seedCurrency(currencyCode: string): Promise<void> {
    const existingCurrency = await this.currencyRepository.findOne({
      where: { code: currencyCode },
    });

    if (existingCurrency) {
      this.logger.log(`Currency ${currencyCode} already exists, skipping...`);
      return;
    }

    const config = getCurrencyConfig(currencyCode as any);
    const currencyData = {
      ...config,
      rate: getExchangeRate(currencyCode as any, 'USD'),
      lastUpdated: new Date(),
    };

    try {
      await this.currencyRepository.save(currencyData);
      this.logger.log(`Successfully seeded currency: ${currencyCode}`);
    } catch (error) {
      this.logger.error(`Failed to seed currency ${currencyCode}:`, error);
      throw error;
    }
  }

  async ensureCurrenciesExist(): Promise<Currency[]> {
    const currencies: Currency[] = [];

    for (const currencyCode of SUPPORTED_CURRENCIES) {
      let currency = await this.currencyRepository.findOne({
        where: { code: currencyCode },
      });

      if (!currency) {
        const config = getCurrencyConfig(currencyCode as any);
        currency = await this.currencyRepository.save({
          ...config,
          rate: getExchangeRate(currencyCode as any, 'USD'),
          lastUpdated: new Date(),
        });
        this.logger.log(`Created missing currency: ${currencyCode}`);
      }

      currencies.push(currency);
    }

    return currencies;
  }
}
