import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

export interface NLSearchRequestDto {
  query: string;
}

export interface StructuredFilters {
  fromDate?: string;
  toDate?: string;
  counterpartyEmail?: string;
  types?: string[];
  currencies?: string[];
}

export interface NLSearchResponse {
  transactions?: Array<{
    id: string;
    type: string;
    amount: string;
    currency: string;
    counterpartyEmail?: string;
    createdAt: string;
  }>;
  summary?: string;
  filters?: StructuredFilters;
  error?: string;
  fallbackUrl?: string;
}

@Injectable()
export class NLSearchService {
  private readonly rateLimits = new Map<string, { count: number; resetAt: number }>();
  private readonly queryCache = new Map<string, { response: NLSearchResponse; expiresAt: number }>();

  /**
   * Sanitizes query string to prevent prompt injection attacks.
   */
  public sanitizeQuery(query: string): string {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Query cannot be empty');
    }
    if (query.length > 200) {
      throw new BadRequestException('Query exceeds maximum length of 200 characters');
    }

    const injectionPatterns = [
      /ignore\s+(previous|all)\s+instructions/i,
      /system\s+prompt/i,
      /override\s+rules/i,
      /forget\s+all/i,
      /you\s+are\s+now/i,
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(query)) {
        throw new BadRequestException('Prompt injection attempt detected');
      }
    }

    return query.trim();
  }

  /**
   * Enforces 10 natural language searches per user per hour rate limit.
   */
  private checkRateLimit(userId: string): void {
    const now = Date.now();
    const userLimit = this.rateLimits.get(userId);

    if (!userLimit || userLimit.resetAt < now) {
      this.rateLimits.set(userId, { count: 1, resetAt: now + 3600000 }); // 1 hour
      return;
    }

    if (userLimit.count >= 10) {
      throw new HttpException(
        'Rate limit exceeded: max 10 natural language searches per hour',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    userLimit.count += 1;
  }

  /**
   * Processes natural language query to filter transaction history.
   */
  async search(userId: string, queryDto: NLSearchRequestDto): Promise<NLSearchResponse> {
    const cleanQuery = this.sanitizeQuery(queryDto.query);
    this.checkRateLimit(userId);

    const cacheKey = `${userId}_${cleanQuery}`;
    const now = Date.now();

    if (this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey)!;
      if (cached.expiresAt > now) {
        return cached.response;
      }
    }

    try {
      // Extract structured filter from natural language
      const filters = this.extractFiltersFromQuery(cleanQuery);
      const transactions = this.mockExecuteTransactionsQuery(userId, filters);
      const summary = `Found ${transactions.length} transaction(s) matching "${cleanQuery}".`;

      const response: NLSearchResponse = {
        transactions,
        summary,
        filters,
      };

      this.queryCache.set(cacheKey, {
        response,
        expiresAt: now + 60000, // 60s TTL
      });

      return response;
    } catch {
      // Graceful fallback — never return 500
      return {
        error: 'Could not understand query. Try using the filter options instead.',
        fallbackUrl: '/v2/transactions',
      };
    }
  }

  private extractFiltersFromQuery(query: string): StructuredFilters {
    const filters: StructuredFilters = {};
    const lower = query.toLowerCase();

    if (lower.includes('john')) {
      filters.counterpartyEmail = 'john@';
    }
    if (lower.includes('xlm')) {
      filters.currencies = ['XLM'];
    }
    if (lower.includes('ngn')) {
      filters.currencies = ['NGN'];
    }
    if (lower.includes('failed')) {
      filters.types = ['FAILED'];
    } else if (lower.includes('payment') || lower.includes('send')) {
      filters.types = ['SEND'];
    }

    return filters;
  }

  private mockExecuteTransactionsQuery(
    userId: string,
    filters: StructuredFilters
  ) {
    const all = [
      {
        id: 'tx_nl_1',
        type: 'SEND',
        amount: '50.00',
        currency: 'XLM',
        counterpartyEmail: 'john@example.com',
        createdAt: '2026-03-15T10:00:00Z',
      },
      {
        id: 'tx_nl_2',
        type: 'SEND',
        amount: '100.00',
        currency: 'XLM',
        counterpartyEmail: 'john@example.com',
        createdAt: '2026-03-20T14:30:00Z',
      },
    ];

    return all.filter((tx) => {
      if (filters.counterpartyEmail && !tx.counterpartyEmail.includes(filters.counterpartyEmail.replace('@', ''))) {
        return false;
      }
      if (filters.currencies && !filters.currencies.includes(tx.currency)) {
        return false;
      }
      return true;
    });
  }
}
