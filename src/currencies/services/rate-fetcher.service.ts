import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { Currency } from '../entities/currency.entity';
import { CurrencyType } from '../enum/currencyType.enum';
import { MOCK_FIAT_RATES, MOCK_CRYPTO_RATES } from '../constants/mock-rates';

export interface RateApiError {
  code: number;
  message: string;
  provider: string;
  endpoint: string;
  timestamp: Date;
}

export interface FallbackRate {
  code: string;
  rate: number;
  source: string;
  timestamp: Date;
}

export interface ApiHealthStatus {
  provider: string;
  isHealthy: boolean;
  lastCheck: Date;
  lastSuccess: Date;
  errorCount: number;
  consecutiveFailures: number;
}

@Injectable()
export class RateFetcherService implements OnModuleInit {
  private readonly logger = new Logger(RateFetcherService.name);
  private readonly openExchangeRatesClient: AxiosInstance;
  private readonly coingeckoClient: AxiosInstance;
  private readonly exchangeRateApiClient: AxiosInstance; // Fallback API
  private readonly isDevelopment: boolean;
  private readonly fallbackRates: Map<string, FallbackRate> = new Map();
  private readonly apiHealthStatus: Map<string, ApiHealthStatus> = new Map();
  private readonly circuitBreaker: Map<
    string,
    { isOpen: boolean; lastAttempt: Date; failures: number }
  > = new Map();

  // Circuit breaker configuration
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
    private readonly configService: ConfigService,
  ) {
    // Check if we're in development mode (no API keys)
    const hasApiKeys =
      this.configService.get<string>('OPENEXCHANGERATES_API_KEY') &&
      this.configService.get<string>('COINGECKO_API_KEY');

    this.isDevelopment = !hasApiKeys;

    if (this.isDevelopment) {
      this.logger.warn(
        'Running in development mode with mock rates. Add API keys to .env file for live rates.',
      );
    } else {
      // Initialize OpenExchangeRates client
      this.openExchangeRatesClient = axios.create({
        baseURL: 'https://openexchangerates.org/api',
        timeout: this.configService.get('API_TIMEOUT', 10000),
        headers: {
          'User-Agent': 'NexaFX/1.0.0 (contact@nexacore.org)',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      // Initialize CoinGecko client
      this.coingeckoClient = axios.create({
        baseURL: 'https://api.coingecko.com/api/v3',
        timeout: this.configService.get('API_TIMEOUT', 10000),
        headers: {
          'User-Agent': 'NexaFX/1.0.0 (contact@nexacore.org)',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      // Initialize fallback ExchangeRate API client
      this.exchangeRateApiClient = axios.create({
        baseURL: 'https://api.exchangerate-api.com/v4',
        timeout: this.configService.get('API_TIMEOUT', 10000),
        headers: {
          'User-Agent': 'NexaFX/1.0.0 (contact@nexacore.org)',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      // Configure enhanced retry logic for all clients
      [
        this.openExchangeRatesClient,
        this.coingeckoClient,
        this.exchangeRateApiClient,
      ].forEach((client, index) => {
        const clientNames = [
          'OpenExchangeRates',
          'CoinGecko',
          'ExchangeRateAPI',
        ];
        const clientName = clientNames[index];

        // Check if client has the interceptors property (real axios instance)
        if (client && client.interceptors) {
          axiosRetry(client, {
            retries: this.configService.get('API_MAX_RETRIES', 3),
            retryDelay: (retryCount) => {
              const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
              this.logger.debug(
                `${clientName}: Retrying request in ${delay}ms (attempt ${retryCount})`,
              );
              return delay;
            },
            retryCondition: (error: AxiosError) => {
              const status = error.response?.status;
              // Retry on network errors, 5xx errors, and specific 4xx errors
              const shouldRetry =
                axiosRetry.isNetworkOrIdempotentRequestError(error) ||
                status === 429 || // Rate limit
                status === 408 || // Request timeout
                status === 502 || // Bad gateway
                status === 503 || // Service unavailable
                status === 504; // Gateway timeout

              if (shouldRetry) {
                this.logger.warn(
                  `${clientName}: Retrying due to ${status || 'network'} error`,
                );
              }

              return shouldRetry;
            },
          });
        }

        // Add request interceptor for logging (only if client has interceptors)
        if (client && client.interceptors) {
          client.interceptors.request.use(
            (config) => {
              this.logger.debug(
                `${clientName}: Making request to ${config.url}`,
              );
              return config;
            },
            (error) => {
              this.logger.error(`${clientName}: Request error`, error);
              throw new Error(
                `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            },
          );

          // Add response interceptor for error handling and logging
          client.interceptors.response.use(
            (response) => {
              this.logger.debug(`${clientName}: Request successful`);
              this.updateApiHealth(clientName, true);
              return response;
            },
            (error: AxiosError) => {
              this.handleApiError(error, clientName);
              return Promise.reject(error);
            },
          );
        }
      });

      // Initialize API health tracking
      this.initializeApiHealthTracking();
    }
  }

  async onModuleInit() {
    // Initialize currencies with mock data on startup if they don't exist
    if (this.isDevelopment) {
      await this.initializeMockCurrencies();
    } else {
      // Validate API keys on startup
      await this.validateApiKeys();
    }
  }

  /**
   * Initialize API health tracking for all providers
   */
  private initializeApiHealthTracking(): void {
    const providers = ['OpenExchangeRates', 'CoinGecko', 'ExchangeRateAPI'];
    providers.forEach((provider) => {
      this.apiHealthStatus.set(provider, {
        provider,
        isHealthy: true,
        lastCheck: new Date(),
        lastSuccess: new Date(),
        errorCount: 0,
        consecutiveFailures: 0,
      });
    });
  }

  /**
   * Update API health status
   */
  private updateApiHealth(provider: string, isSuccess: boolean): void {
    const health = this.apiHealthStatus.get(provider);
    if (!health) return;

    health.lastCheck = new Date();
    health.errorCount = isSuccess ? 0 : health.errorCount + 1;
    health.consecutiveFailures = isSuccess ? 0 : health.consecutiveFailures + 1;

    if (isSuccess) {
      health.lastSuccess = new Date();
      health.isHealthy = true;
    } else {
      health.isHealthy =
        health.consecutiveFailures < this.MAX_CONSECUTIVE_FAILURES;
    }

    this.apiHealthStatus.set(provider, health);
  }

  /**
   * Handle API errors with detailed logging and circuit breaker logic
   */
  private handleApiError(error: AxiosError, provider: string): void {
    const status = error.response?.status;
    const message = error.message;
    const config = error.config;

    const apiError: RateApiError = {
      code: status || 0,
      message,
      provider,
      endpoint: config?.url || 'unknown',
      timestamp: new Date(),
    };

    this.updateApiHealth(provider, false);

    // Log detailed error information
    this.logger.error(
      `API Error - Provider: ${provider}, Status: ${status}, URL: ${config?.url}`,
      {
        error: apiError,
        headers: config?.headers,
        params: config?.params as Record<string, unknown> | undefined,
        stack: error.stack,
      },
    );

    // Handle specific 403 errors
    if (status === 403) {
      this.handle403Error(apiError);
    }

    // Update circuit breaker
    this.updateCircuitBreaker(provider, false);
  }

  /**
   * Handle 403 Forbidden errors specifically
   */
  private handle403Error(apiError: RateApiError): void {
    this.logger.error(`403 Forbidden Error from ${apiError.provider}`, {
      error: apiError,
      possibleCauses: [
        'Invalid or expired API key',
        'API key quota exceeded',
        'IP address blocked',
        'Authentication method changed',
        'API plan restrictions',
        'Terms of service violation',
      ],
      recommendations: [
        'Verify API key is correct and not expired',
        'Check API usage quotas and limits',
        'Review API provider documentation for changes',
        'Consider upgrading API plan if on free tier',
        'Contact API provider support if issue persists',
      ],
    });

    // Temporarily disable this provider
    this.updateCircuitBreaker(apiError.provider, false);
  }

  /**
   * Update circuit breaker state
   */
  private updateCircuitBreaker(provider: string, isSuccess: boolean): void {
    let breaker = this.circuitBreaker.get(provider);
    if (!breaker) {
      breaker = { isOpen: false, lastAttempt: new Date(), failures: 0 };
    }

    if (isSuccess) {
      breaker.failures = 0;
      breaker.isOpen = false;
    } else {
      breaker.failures++;
      breaker.lastAttempt = new Date();

      if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
        breaker.isOpen = true;
        this.logger.warn(
          `Circuit breaker opened for ${provider} after ${breaker.failures} failures`,
        );
      }
    }

    this.circuitBreaker.set(provider, breaker);
  }

  /**
   * Check if circuit breaker should allow requests
   */
  private canMakeRequest(provider: string): boolean {
    const breaker = this.circuitBreaker.get(provider);
    if (!breaker || !breaker.isOpen) return true;

    // Check if timeout period has passed
    const timeoutPassed =
      Date.now() - breaker.lastAttempt.getTime() > this.CIRCUIT_BREAKER_TIMEOUT;
    if (timeoutPassed) {
      this.logger.log(
        `Circuit breaker half-open for ${provider}, attempting request`,
      );
      return true;
    }

    return false;
  }

  /**
   * Validate API keys on startup
   */
  private async validateApiKeys(): Promise<void> {
    const validations = [
      this.validateOpenExchangeRatesKey(),
      this.validateCoinGeckoKey(),
    ];

    const results = await Promise.allSettled(validations);

    results.forEach((result, index) => {
      const providers = ['OpenExchangeRates', 'CoinGecko'];
      const provider = providers[index];

      if (result.status === 'rejected') {
        this.logger.warn(`${provider} API validation failed:`, result.reason);
      } else {
        this.logger.log(`${provider} API key validated successfully`);
      }
    });
  }

  /**
   * Validate OpenExchangeRates API key
   */
  private async validateOpenExchangeRatesKey(): Promise<boolean> {
    try {
      const apiKey = this.configService.get<string>(
        'OPENEXCHANGERATES_API_KEY',
      );
      if (!apiKey) {
        throw new Error('OPENEXCHANGERATES_API_KEY not configured');
      }

      await this.openExchangeRatesClient.get('/currencies.json', {
        params: { app_id: apiKey },
      });

      return true;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 403) {
        this.logger.error(
          'OpenExchangeRates API key validation failed: 403 Forbidden',
        );
      }
      throw error;
    }
  }

  /**
   * Validate CoinGecko API key
   */
  private async validateCoinGeckoKey(): Promise<boolean> {
    // CoinGecko free tier doesn't require API key validation
    // We'll just test a simple endpoint
    await this.coingeckoClient.get('/ping');
    return true;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateRates() {
    const startTime = Date.now();
    this.logger.log('Starting rate update process...');

    try {
      if (this.isDevelopment) {
        await this.updateMockRates();
      } else {
        await this.updateLiveRates();
      }

      const duration = Date.now() - startTime;
      this.logger.log(`Exchange rates updated successfully in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to update exchange rates after ${duration}ms`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Try to use fallback rates if all primary sources fail
      await this.useFallbackRates();
    }
  }

  /**
   * Update rates using live APIs with fallback mechanisms
   */
  private async updateLiveRates(): Promise<void> {
    const updatePromises: Promise<void>[] = [];

    // Update fiat rates with primary and fallback sources
    updatePromises.push(this.updateFiatRatesWithFallback());

    // Update crypto rates
    updatePromises.push(this.updateCryptoRatesWithFallback());

    // Wait for all updates, but don't fail if some sources are down
    const results = await Promise.allSettled(updatePromises);

    let successCount = 0;
    results.forEach((result, index) => {
      const types = ['fiat', 'crypto'];
      const type = types[index];

      if (result.status === 'fulfilled') {
        successCount++;
        this.logger.log(`${type} rates updated successfully`);
      } else {
        this.logger.error(`Failed to update ${type} rates`, {
          reason:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    });

    if (successCount === 0) {
      throw new Error('All rate update sources failed');
    } else if (successCount < results.length) {
      this.logger.warn(
        `Partial rate update success: ${successCount}/${results.length} sources updated`,
      );
    }
  }

  /**
   * Update fiat rates with fallback to alternative API
   */
  private async updateFiatRatesWithFallback(): Promise<void> {
    try {
      await this.updateFiatRates();
    } catch (primaryError) {
      this.logger.warn('Primary fiat rate source failed, trying fallback', {
        error:
          primaryError instanceof Error
            ? primaryError.message
            : String(primaryError),
      });

      try {
        await this.updateFiatRatesFromFallback();
      } catch (fallbackError) {
        this.logger.error('Fallback fiat rate source also failed', {
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError),
        });
        throw fallbackError;
      }
    }
  }

  /**
   * Update crypto rates with error handling
   */
  private async updateCryptoRatesWithFallback(): Promise<void> {
    try {
      await this.updateCryptoRates();
    } catch (error) {
      this.logger.error(
        'Crypto rate update failed, using cached rates if available',
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      // For now, we'll just log the error. In the future, we could add a fallback crypto API
      throw error;
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
      this.logger.error('Failed to initialize mock currencies', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
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

      this.logger.log('Mock rates updated successfully');
    } catch (error) {
      this.logger.error('Failed to update mock rates', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
    if (!this.canMakeRequest('OpenExchangeRates')) {
      throw new Error('OpenExchangeRates circuit breaker is open');
    }

    try {
      const apiKey = this.configService.get<string>(
        'OPENEXCHANGERATES_API_KEY',
      );
      if (!apiKey) {
        throw new Error('OPENEXCHANGERATES_API_KEY not configured');
      }

      this.logger.debug('Fetching fiat rates from OpenExchangeRates...');

      const response = await this.openExchangeRatesClient.get('/latest.json', {
        params: {
          app_id: apiKey,
          base: 'USD', // Changed from 'NGN' to 'USD' as it's more widely supported
          symbols: 'NGN,EUR,GBP,CAD,AUD,JPY,CHF', // Added more supported currencies
        },
      });

      // Type assertion with proper checking
      const responseData = response.data as { rates?: Record<string, number> };
      const rates = responseData.rates;
      if (!rates || typeof rates !== 'object') {
        throw new Error('Invalid response format from OpenExchangeRates');
      }

      const currencies = await this.currencyRepository.find({
        where: { type: CurrencyType.FIAT },
      });

      let updateCount = 0;
      for (const currency of currencies) {
        let rate = rates[currency.code];

        // Handle USD base currency (rate = 1)
        if (currency.code === 'USD') {
          rate = 1;
        }

        if (rate && typeof rate === 'number' && rate > 0) {
          await this.currencyRepository.update(currency.id, {
            rate,
            lastUpdated: new Date(),
          });

          // Store in fallback cache
          this.fallbackRates.set(currency.code, {
            code: currency.code,
            rate,
            source: 'OpenExchangeRates',
            timestamp: new Date(),
          });

          updateCount++;
        }
      }

      this.updateCircuitBreaker('OpenExchangeRates', true);
      this.logger.log(
        `Updated ${updateCount} fiat rates from OpenExchangeRates`,
      );
    } catch (error) {
      const axiosError = error as AxiosError;
      this.handleApiError(axiosError, 'OpenExchangeRates');
      throw error;
    }
  }

  /**
   * Update fiat rates using fallback API (exchangerate-api.com)
   */
  private async updateFiatRatesFromFallback(): Promise<void> {
    if (!this.canMakeRequest('ExchangeRateAPI')) {
      throw new Error('ExchangeRateAPI circuit breaker is open');
    }

    try {
      this.logger.debug(
        'Fetching fiat rates from fallback API (ExchangeRate-API)...',
      );

      const response = await this.exchangeRateApiClient.get('/latest/USD');

      // Type assertion with proper checking
      const responseData = response.data as { rates?: Record<string, number> };
      const rates = responseData.rates;
      if (!rates || typeof rates !== 'object') {
        throw new Error('Invalid response format from ExchangeRate-API');
      }

      const currencies = await this.currencyRepository.find({
        where: { type: CurrencyType.FIAT },
      });

      let updateCount = 0;
      for (const currency of currencies) {
        let rate = rates[currency.code];

        // Handle USD base currency
        if (currency.code === 'USD') {
          rate = 1;
        }

        if (rate && typeof rate === 'number' && rate > 0) {
          await this.currencyRepository.update(currency.id, {
            rate,
            lastUpdated: new Date(),
          });

          // Store in fallback cache
          this.fallbackRates.set(currency.code, {
            code: currency.code,
            rate,
            source: 'ExchangeRateAPI',
            timestamp: new Date(),
          });

          updateCount++;
        }
      }

      this.updateCircuitBreaker('ExchangeRateAPI', true);
      this.logger.log(
        `Updated ${updateCount} fiat rates from ExchangeRate-API (fallback)`,
      );
    } catch (error) {
      const axiosError = error as AxiosError;
      this.handleApiError(axiosError, 'ExchangeRateAPI');
      throw error;
    }
  }

  /**
   * Use cached fallback rates when all APIs fail
   */
  private async useFallbackRates(): Promise<void> {
    if (this.fallbackRates.size === 0) {
      this.logger.error('No fallback rates available');
      return;
    }

    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
    let usedCount = 0;

    for (const [code, fallbackRate] of this.fallbackRates.entries()) {
      // Only use recent fallback rates
      if (fallbackRate.timestamp.getTime() > cutoffTime) {
        try {
          const currency = await this.currencyRepository.findOne({
            where: { code },
          });

          if (currency) {
            await this.currencyRepository.update(currency.id, {
              rate: fallbackRate.rate,
              lastUpdated: new Date(),
            });
            usedCount++;
          }
        } catch (error) {
          this.logger.error(`Failed to apply fallback rate for ${code}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (usedCount > 0) {
      this.logger.warn(
        `Applied ${usedCount} fallback rates due to API failures`,
      );
    } else {
      this.logger.error(
        'No recent fallback rates available (all rates are older than 24 hours)',
      );
    }
  }

  private async updateCryptoRates() {
    if (!this.canMakeRequest('CoinGecko')) {
      throw new Error('CoinGecko circuit breaker is open');
    }

    try {
      this.logger.debug('Fetching crypto rates from CoinGecko...');

      const response = await this.coingeckoClient.get('/simple/price', {
        params: {
          ids: 'bitcoin,ethereum,tether',
          vs_currencies: 'usd',
        },
      });

      const data = response.data as Record<string, { usd: number }>;
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format from CoinGecko');
      }

      const cryptoMapping = {
        bitcoin: 'BTC',
        ethereum: 'ETH',
        tether: 'USDT',
      };

      const currencies = await this.currencyRepository.find({
        where: { type: CurrencyType.CRYPTO },
      });

      let updateCount = 0;
      for (const currency of currencies) {
        const cryptoId = Object.entries(cryptoMapping).find(
          ([, code]) => code === currency.code,
        )?.[0];

        if (cryptoId && data[cryptoId]?.usd) {
          const rate = data[cryptoId].usd;

          if (typeof rate === 'number' && rate > 0) {
            await this.currencyRepository.update(currency.id, {
              rate,
              lastUpdated: new Date(),
            });

            // Store in fallback cache
            this.fallbackRates.set(currency.code, {
              code: currency.code,
              rate,
              source: 'CoinGecko',
              timestamp: new Date(),
            });

            updateCount++;
          }
        }
      }

      this.updateCircuitBreaker('CoinGecko', true);
      this.logger.log(`Updated ${updateCount} crypto rates from CoinGecko`);
    } catch (error) {
      const axiosError = error as AxiosError;
      this.handleApiError(axiosError, 'CoinGecko');
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
        this.logger.warn(
          `Unable to find rates for ${fromCurrency} or ${toCurrency}`,
        );
        return null;
      }

      // Convert through USD as base currency
      const amountInUSD = amount / fromRate;
      return amountInUSD * toRate;
    } catch (error) {
      this.logger.error('Currency conversion failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  // Get all supported currencies with their latest rates
  async getAllCurrentRates(): Promise<Record<string, number>> {
    try {
      const currencies = await this.currencyRepository.find({
        where: { isActive: true },
      });

      return currencies.reduce(
        (acc, curr) => {
          if (curr.rate) {
            acc[curr.code] = curr.rate;
          }
          return acc;
        },
        {} as Record<string, number>,
      );
    } catch (error) {
      this.logger.error('Failed to fetch all current rates', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {};
    }
  }

  /**
   * Get API health status for monitoring
   */
  getApiHealthStatus(): ApiHealthStatus[] {
    return Array.from(this.apiHealthStatus.values());
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus(): Array<{
    provider: string;
    isOpen: boolean;
    failures: number;
    lastAttempt: Date;
  }> {
    return Array.from(this.circuitBreaker.entries()).map(
      ([provider, breaker]) => ({
        provider,
        isOpen: breaker.isOpen,
        failures: breaker.failures,
        lastAttempt: breaker.lastAttempt,
      }),
    );
  }

  /**
   * Manually reset circuit breaker for a provider
   */
  resetCircuitBreaker(provider: string): void {
    const breaker = this.circuitBreaker.get(provider);
    if (breaker) {
      breaker.isOpen = false;
      breaker.failures = 0;
      breaker.lastAttempt = new Date();
      this.circuitBreaker.set(provider, breaker);
      this.logger.log(`Circuit breaker reset for ${provider}`);
    } else {
      throw new Error(`Circuit breaker not found for provider: ${provider}`);
    }
  }

  /**
   * Get fallback rates cache
   */
  getFallbackRates(): FallbackRate[] {
    return Array.from(this.fallbackRates.values());
  }

  /**
   * Health check endpoint for the service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    apiStatus: ApiHealthStatus[];
    circuitBreakers: Array<{ provider: string; isOpen: boolean }>;
    lastUpdate: Date;
    fallbackRatesCount: number;
  }> {
    const apiStatus = this.getApiHealthStatus();
    const circuitBreakers = this.getCircuitBreakerStatus();
    const fallbackRatesCount = this.fallbackRates.size;

    // Check if any currency has been updated in the last hour
    const currencies = await this.currencyRepository.find({
      where: { isActive: true },
      order: { lastUpdated: 'DESC' },
      take: 1,
    });

    const lastUpdate = currencies[0]?.lastUpdated || new Date(0);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const healthyApis = apiStatus.filter((api) => api.isHealthy);
    const openCircuitBreakers = circuitBreakers.filter((cb) => cb.isOpen);

    let status: 'healthy' | 'degraded' | 'unhealthy';

    if (lastUpdate < oneHourAgo) {
      status = 'unhealthy';
    } else if (
      openCircuitBreakers.length > 0 ||
      healthyApis.length < apiStatus.length
    ) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      apiStatus,
      circuitBreakers: circuitBreakers.map((cb) => ({
        provider: cb.provider,
        isOpen: cb.isOpen,
      })),
      lastUpdate,
      fallbackRatesCount,
    };
  }
}
