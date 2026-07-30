import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { User } from '../users/user.entity';
import { AuditLog } from '../audit-logs/entities/audit-log.entity';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(SupportTicket)
    private readonly supportTicketRepository: Repository<SupportTicket>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  buildTsQuery(query: string): string {
    const normalized = query
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.replace(/\*$/, ''));

    if (!normalized.length) {
      return '';
    }

    return normalized
      .map((word, index) => (index === normalized.length - 1 ? `${word}:*` : word))
      .join(' & ');
  }

  private async runQuery<T extends object>(
    repository: Repository<T>,
    query: string,
    clause: string,
    where: Record<string, unknown>,
    orderBy: string,
  ): Promise<T[]> {
    const tsQuery = this.buildTsQuery(query);
    if (!tsQuery) {
      return [];
    }

    return repository.query(
      `
        SELECT *, ts_rank_cd("searchVector", plainto_tsquery($1)) AS rank
        FROM (${clause}) AS sub
        WHERE "searchVector" @@ to_tsquery('english', $2)
        ORDER BY rank DESC, "createdAt" DESC
        LIMIT 10
      `,
      [query, tsQuery],
    );
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const bucket = this.rateLimitBuckets.get(userId);

    if (!bucket || bucket.resetAt <= now) {
      this.rateLimitBuckets.set(userId, { count: 1, resetAt: now + 60_000 });
      return true;
    }

    if (bucket.count >= 20) {
      return false;
    }

    bucket.count += 1;
    return true;
  }

  async searchTransactions(userId: string, query: string, limit = 10) {
    const tsQuery = this.buildTsQuery(query);
    if (!tsQuery) {
      return [];
    }

    return this.transactionRepository.query(
      `
        SELECT
          id,
          userId,
          type,
          amount,
          currency,
          status,
          "createdAt",
          "updatedAt",
          ts_headline('english', COALESCE("counterpartyMemo", '') || ' ' || COALESCE(reference, '') || ' ' || COALESCE(metadata->>'description', ''), to_tsquery('english', $2)) AS excerpt,
          ts_rank_cd("searchVector", to_tsquery('english', $2)) AS rank
        FROM transactions
        WHERE "userId" = $1
          AND "searchVector" @@ to_tsquery('english', $2)
        ORDER BY rank DESC, "createdAt" DESC
        LIMIT $3
      `,
      [userId, tsQuery, limit],
    );
  }

  async searchNotifications(userId: string, query: string, limit = 10) {
    const tsQuery = this.buildTsQuery(query);
    if (!tsQuery) {
      return [];
    }

    return this.notificationRepository.query(
      `
        SELECT
          id,
          "userId",
          title,
          message,
          type,
          status,
          "createdAt",
          ts_headline('english', COALESCE(title, '') || ' ' || COALESCE(message, ''), to_tsquery('english', $2)) AS excerpt,
          ts_rank_cd("searchVector", to_tsquery('english', $2)) AS rank
        FROM notifications
        WHERE "userId" = $1
          AND "searchVector" @@ to_tsquery('english', $2)
        ORDER BY rank DESC, "createdAt" DESC
        LIMIT $3
      `,
      [userId, tsQuery, limit],
    );
  }

  async searchTickets(userId: string, query: string, limit = 10) {
    const tsQuery = this.buildTsQuery(query);
    if (!tsQuery) {
      return [];
    }

    return this.supportTicketRepository.query(
      `
        SELECT
          id,
          "userId",
          subject,
          body,
          "createdAt",
          ts_headline('english', COALESCE(subject, '') || ' ' || COALESCE(body, ''), to_tsquery('english', $2)) AS excerpt,
          ts_rank_cd("searchVector", to_tsquery('english', $2)) AS rank
        FROM support_tickets
        WHERE "userId" = $1
          AND "searchVector" @@ to_tsquery('english', $2)
        ORDER BY rank DESC, "createdAt" DESC
        LIMIT $3
      `,
      [userId, tsQuery, limit],
    );
  }

  async searchAll(userId: string, query: string, types: string[] = ['transactions', 'notifications', 'tickets']) {
    if (!this.checkRateLimit(userId)) {
      throw new HttpException('Too many search requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    const tasks = [] as Array<Promise<unknown>>;
    const resultMap: Record<string, unknown[]> = {
      transactions: [],
      notifications: [],
      tickets: [],
    };

    if (types.includes('transactions')) {
      tasks.push(this.searchTransactions(userId, query));
    }
    if (types.includes('notifications')) {
      tasks.push(this.searchNotifications(userId, query));
    }
    if (types.includes('tickets')) {
      tasks.push(this.searchTickets(userId, query));
    }

    const results = await Promise.all(tasks);
    if (types.includes('transactions')) {
      resultMap.transactions = (results.shift() ?? []) as unknown[];
    }
    if (types.includes('notifications')) {
      resultMap.notifications = (results.shift() ?? []) as unknown[];
    }
    if (types.includes('tickets')) {
      resultMap.tickets = (results.shift() ?? []) as unknown[];
    }

    return resultMap;
  }

  async trackAnalytics(query: string): Promise<void> {
    const normalized = query?.trim() ?? '';
    if (!normalized || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(normalized) || /\+?\d{7,15}/.test(normalized)) {
      return;
    }

    try {
      this.logger.debug(`Track search term: ${normalized}`);
    } catch (error) {
      this.logger.warn(`Failed to track search analytics: ${error.message}`);
    }
  }

  async searchAdmin(query: string, userId: string, types: string[] = ['users', 'transactions']) {
    const tsQuery = this.buildTsQuery(query);
    if (!tsQuery) {
      return { users: [], transactions: [], auditLogs: [] };
    }

    const [users, transactions, auditLogs] = await Promise.all([
      types.includes('users')
        ? this.userRepository.query(
            `
              SELECT id, email, "firstName", "lastName"
              FROM users
              WHERE to_tsvector('english', COALESCE(email, '') || ' ' || COALESCE("firstName", '') || ' ' || COALESCE("lastName", '')) @@ to_tsquery('english', $1)
              ORDER BY "createdAt" DESC
              LIMIT 10
            `,
            [tsQuery],
          )
        : [],
      types.includes('transactions')
        ? this.transactionRepository.query(
            `
              SELECT id, "userId", type, amount, currency, status, "createdAt"
              FROM transactions
              WHERE "searchVector" @@ to_tsquery('english', $1)
              ORDER BY "createdAt" DESC
              LIMIT 10
            `,
            [tsQuery],
          )
        : [],
      types.includes('audit_logs')
        ? this.auditLogRepository.query(
            `
              SELECT id, action, "entityId", "createdAt"
              FROM audit_logs
              WHERE to_tsvector('english', COALESCE(action, '')) @@ to_tsquery('english', $1)
              ORDER BY "createdAt" DESC
              LIMIT 10
            `,
            [tsQuery],
          )
        : [],
    ]);

    return { users, transactions, auditLogs };
  }
}
