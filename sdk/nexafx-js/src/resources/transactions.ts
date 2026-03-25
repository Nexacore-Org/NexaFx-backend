import type { NexaFxClient } from '../client';
import { createAsyncOffsetIterable } from '../pagination';
import type {
  CreateDepositDto,
  CreateTransactionDto,
  CreateWithdrawalDto,
  TransactionListResponseDto,
  TransactionResponseDto,
  TransactionStatus,
  TransactionType,
} from '../types';

export interface TransactionQuery {
  type?: TransactionType;
  status?: TransactionStatus;
  currency?: string;
  page?: number;
  limit?: number;
}

export class TransactionsResource {
  constructor(private readonly client: NexaFxClient) {}

  async create(input: CreateTransactionDto): Promise<TransactionResponseDto> {
    if (input.type === 'deposit') {
      return this.deposit(this.toDepositPayload(input));
    }

    return this.withdraw(this.toWithdrawalPayload(input));
  }

  async deposit(payload: CreateDepositDto): Promise<TransactionResponseDto> {
    return this.client.request<TransactionResponseDto>(
      'POST',
      '/v1/transactions/deposit',
      { body: payload },
    );
  }

  async withdraw(
    payload: CreateWithdrawalDto,
  ): Promise<TransactionResponseDto> {
    return this.client.request<TransactionResponseDto>(
      'POST',
      '/v1/transactions/withdraw',
      { body: payload },
    );
  }

  async list(query: TransactionQuery = {}): Promise<TransactionListResponseDto> {
    return this.client.request<TransactionListResponseDto>(
      'GET',
      '/v1/transactions',
      { query },
    );
  }

  async get(id: string): Promise<TransactionResponseDto> {
    return this.client.request<TransactionResponseDto>(
      'GET',
      `/v1/transactions/${encodeURIComponent(id)}`,
    );
  }

  async verify(id: string): Promise<TransactionResponseDto> {
    return this.client.request<TransactionResponseDto>(
      'POST',
      `/v1/transactions/${encodeURIComponent(id)}/verify`,
    );
  }

  iterate(query: Omit<TransactionQuery, 'page'> = {}): AsyncIterable<TransactionResponseDto> {
    return createAsyncOffsetIterable(async (page) => {
      const response = await this.list({ ...query, page });
      return {
        items: response.transactions,
        total: response.total,
      };
    });
  }

  private toDepositPayload(input: Extract<CreateTransactionDto, { type: 'deposit' }>): CreateDepositDto {
    const { type: _type, ...payload } = input;
    return payload;
  }

  private toWithdrawalPayload(
    input: Extract<CreateTransactionDto, { type: 'withdraw' | 'withdrawal' }>,
  ): CreateWithdrawalDto {
    const { type: _type, ...payload } = input;
    return payload;
  }
}
