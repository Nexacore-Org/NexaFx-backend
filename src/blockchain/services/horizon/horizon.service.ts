import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as rax from 'retry-axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class HorizonService {
  private readonly logger = new Logger(HorizonService.name);
  private readonly horizonUrl: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.horizonUrl = this.configService.get<string>('STELLAR_HORIZON_URL');
  }

  private async get(path: string | undefined) {
    const url = `${this.horizonUrl}${path}`;

    const interceptorId = rax.attach(); // attach retry

    try {
      const response = await axios.get(url, {
        raxConfig: {
          retry: 3,
          noResponseRetries: 2,
          retryDelay: 1000,
          httpMethodsToRetry: ['GET'],
          statusCodesToRetry: [
            [100, 199],
            [429, 429],
            [500, 599],
          ],
        },
      } as any);
      return response.data;
    } catch (error) {
      this.logger.error(`Horizon API error for path ${path}: ${error.message}`);
      throw new Error(`Horizon API call failed: ${error.message}`);
    }
  }

  async getAccountBalances(accountId: string) {
    const cacheKey = `balances:${accountId}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await this.get(`/accounts/${accountId}`);
    const balances = data.balances.map((balance) => ({
      asset_type: balance.asset_type,
      asset_code: balance.asset_code,
      balance: balance.balance,
    }));

    await this.cacheManager.set(cacheKey, balances, 60); // cache for 60 seconds
    return balances;
  }

  async getTransactionHistory(accountId: string, limit = 10) {
    const cacheKey = `txns:${accountId}:${limit}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await this.get(
      `/accounts/${accountId}/transactions?limit=${limit}&order=desc`,
    );
    const transactions = data._embedded.records.map((txn) => ({
      id: txn.id,
      created_at: txn.created_at,
      memo: txn.memo,
      operation_count: txn.operation_count,
      successful: txn.successful,
    }));

    await this.cacheManager.set(cacheKey, transactions, 60);
    return transactions;
  }

  async getAccountStatus(accountId: string) {
    const data = await this.get(`/accounts/${accountId}`);
    return {
      sequence: data.sequence,
      subentry_count: data.subentry_count,
      thresholds: data.thresholds,
      flags: data.flags,
      signers: data.signers,
      trustlines: data.balances.filter((bal) => bal.asset_type !== 'native'),
    };
  }
}
