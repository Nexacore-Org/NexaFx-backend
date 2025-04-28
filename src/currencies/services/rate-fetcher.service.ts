import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { Currency } from '../entities/currency.entity';
import { CurrencyType } from '../enum/currencyType.enum';
import { MOCK_FIAT_RATES, MOCK_CRYPTO_RATES } from '../constants/mock-rates';

@Injectable()
export class RateFetcherService implements OnModuleInit {
  private readonly logger = new Logger(RateFetcherService.name);
  private readonly openExchangeRatesClient;
  private readonly coingeckoClient;
  private readonly isDevelopment: boolean;

  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
    private readonly configService: ConfigService,
  ) {
    // Check if we're in development mode (no API keys)
    const hasApiKeys = 
      this.configService.get('OPENEXCHANGERATES_API_KEY') &&
      this.configService.get('COINGECKO_API_KEY');
    
    this.isDevelopment = !hasApiKeys;
    
    if (this.isDevelopment) {
      this.logger.warn(
        'Running in development mode with mock rates. Add API keys to .env file for live rates.',
      );
    } else {
      // Initialize Axios clients with retry logic
      this.openExchangeRatesClient = axios.create({
        baseURL: 'https://openexchangerates.org/api',
        timeout: this.configService.get('API_TIMEOUT'),
      });

      this.coingeckoClient = axios.create({
        baseURL: 'https://api.coingecko.com/api/v3',
        timeout: this.configService.get('API_TIMEOUT'),
      });

      // Configure retry logic for both clients
      [this.openExchangeRatesClient, this.coingeckoClient].forEach(client => {
        axiosRetry(client, {
          retries: this.configService.get('API_MAX_RETRIES'),
          retryDelay: axiosRetry.exponentialDelay,
          retryCondition: (error) => {
            return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
              error.response?.status === 429; // Rate limit error
          },
        });
      });
    }
  }

  async onModuleInit() {
    // Initialize currencies with mock data on startup if they don't exist
    if (this.isDevelopment) {
      await this.initializeMockCurrencies();
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateRates() {
    try {
      if (this.isDevelopment) {
        await this.updateMockRates();
      } else {
        await Promise.all([
          this.updateFiatRates(),
          this.updateCryptoRates(),
        ]);
      }
      this.logger.log('Exchange rates updated successfully');
    } catch (error) {
      this.logger.error('Failed to update exchange rates', error.stack);
    }
  }

  private async initializeMockCurrencies() {
    try {
      // Initialize fiat currencies
      for (const [code, rate] of Object.entries(MOCK_FIAT_RATES)) {
        await this.ensureCurrencyExists({
          code,
          name: code,
          symbol: code,
          type: CurrencyType.FIAT,
          rate,
          decimalPlaces: 2,
          isActive: true,
        });
      }

      // Initialize crypto currencies
      for (const [code, rate] of Object.entries(MOCK_CRYPTO_RATES)) {
        await this.ensureCurrencyExists({
          code,
          name: code,
          symbol: code,
          type: CurrencyType.CRYPTO,
          rate,
          decimalPlaces: 8,
          isActive: true,
        });
      }
    } catch (error) {
      this.logger.error('Failed to initialize mock currencies', error.stack);
    }
  }

  private async ensureCurrencyExists(currency: Partial<Currency>) {
    const existing = await this.currencyRepository.findOne({
      where: { code: currency.code },
    });

    if (!existing) {
      await this.currencyRepository.save(currency);
      this.logger.log(`Created currency: ${currency.code}`);
    }
  }

  private async updateMockRates() {
    try {
      // Update fiat currencies
      for (const [code, rate] of Object.entries(MOCK_FIAT_RATES)) {
        await this.updateCurrencyRate(code, rate);
      }

      // Update crypto currencies
      for (const [code, rate] of Object.entries(MOCK_CRYPTO_RATES)) {
        await this.updateCurrencyRate(code, rate);
      }
    } catch (error) {
      this.logger.error('Failed to update mock rates', error.stack);
    }
  }

  private async updateCurrencyRate(code: string, rate: number) {
    await this.currencyRepository.update(
      { code },
      { 
        rate,
        lastUpdated: new Date(),
      },
    );
  }

  private async updateFiatRates() {
    try {
      const response = await this.openExchangeRatesClient.get('/latest.json', {
        params: {
          app_id: this.configService.get('OPENEXCHANGERATES_API_KEY'),
          base: 'USD',
          symbols: 'NGN,EUR,GBP',
        },
      });

      const { rates } = response.data;
      const currencies = await this.currencyRepository.find({
        where: { type: CurrencyType.FIAT },
      });

      for (const currency of currencies) {
        if (rates[currency.code]) {
          await this.currencyRepository.update(currency.id, {
            rate: rates[currency.code],
            lastUpdated: new Date(),
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to update fiat rates', error.stack);
      throw error;
    }
  }

  private async updateCryptoRates() {
    try {
      const response = await this.coingeckoClient.get('/simple/price', {
        params: {
          ids: 'bitcoin,ethereum,tether',
          vs_currencies: 'usd',
          x_cg_demo_api_key: this.configService.get('COINGECKO_API_KEY'),
        },
      });

      const cryptoMapping = {
        'bitcoin': 'BTC',
        'ethereum': 'ETH',
        'tether': 'USDT',
      };

      const currencies = await this.currencyRepository.find({
        where: { type: CurrencyType.CRYPTO },
      });

      for (const currency of currencies) {
        const cryptoId = Object.entries(cryptoMapping)
          .find(([_, code]) => code === currency.code)?.[0];

        if (cryptoId && response.data[cryptoId]) {
          await this.currencyRepository.update(currency.id, {
            rate: response.data[cryptoId].usd,
            lastUpdated: new Date(),
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to update crypto rates', error.stack);
      throw error;
    }
  }

  // Helper method to get current rate for a currency
  async getCurrentRate(currencyCode: string): Promise<number | null> {
    const currency = await this.currencyRepository.findOne({
      where: { code: currencyCode },
    });

    return currency?.rate || null;
  }

  // Convert amount from one currency to another
  async convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number | null> {
    try {
      const [fromRate, toRate] = await Promise.all([
        this.getCurrentRate(fromCurrency),
        this.getCurrentRate(toCurrency),
      ]);

      if (!fromRate || !toRate) {
        this.logger.warn(`Unable to find rates for ${fromCurrency} or ${toCurrency}`);
        return null;
      }

      // Convert through USD as base currency
      const amountInUSD = amount / fromRate;
      return amountInUSD * toRate;
    } catch (error) {
      this.logger.error('Currency conversion failed', error.stack);
      return null;
    }
  }

  // Get all supported currencies with their latest rates
  async getAllCurrentRates(): Promise<Record<string, number>> {
    try {
      const currencies = await this.currencyRepository.find({
        where: { isActive: true },
      });

      return currencies.reduce((acc, curr) => {
        if (curr.rate) {
          acc[curr.code] = curr.rate;
        }
        return acc;
      }, {} as Record<string, number>);
    } catch (error) {
      this.logger.error('Failed to fetch all current rates', error.stack);
      return {};
    }
  }
}
