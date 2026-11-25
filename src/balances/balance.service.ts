import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, EntityManager } from 'typeorm';
import { toDecimal } from './decimal.util';

type Executor = Pick<EntityManager, 'query'>;

/**
 * Single owner of the custodial ledger balance stored in users.balances.
 *
 * Every mutation is ONE conditional UPDATE. Postgres takes the row lock for
 * the UPDATE and, under READ COMMITTED, re-evaluates the WHERE clause against
 * the latest committed row after waiting on a concurrent writer. So two
 * parallel debits can never both pass the sufficiency check against the same
 * starting balance, and no credit is lost to a read-modify-write overwrite.
 *
 * Arithmetic happens in Postgres numeric and amounts cross the boundary as
 * decimal strings, so there is no binary floating point on the money path.
 */
@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * True when balance >= required, compared exactly.
   */
  static isSufficient(
    balance: Decimal.Value,
    required: Decimal.Value,
  ): boolean {
    return toDecimal(balance).gte(toDecimal(required));
  }

  /**
   * Current balance as an exact decimal string ('0' when the currency has
   * no entry yet). Read as text so it never passes through a JS number.
   */
  async getBalance(
    userId: string,
    currency: string,
    manager?: Executor,
  ): Promise<string> {
    this.assertCurrency(currency);
    const rows: Array<{ balance: string }> = await this.executor(manager).query(
      `SELECT COALESCE(balances ->> $2::text, '0') AS balance
         FROM users
        WHERE id = $1`,
      [userId, currency],
    );

    if (!rows || rows.length === 0) {
      throw new NotFoundException('User not found');
    }
    return this.normalize(rows[0].balance);
  }

  /**
   * Add a positive amount. Returns the new balance as a decimal string.
   */
  async credit(
    userId: string,
    currency: string,
    amount: Decimal.Value,
    manager?: Executor,
  ): Promise<string> {
    const value = this.positiveAmount(amount);
    this.assertCurrency(currency);

    const rows = await this.run(
      manager,
      `UPDATE users
          SET balances = jsonb_set(
                COALESCE(balances, '{}'::jsonb),
                ARRAY[$2::text],
                to_jsonb(
                  COALESCE((balances ->> $2::text)::numeric, 0) + $3::numeric
                ),
                true
              )
        WHERE id = $1
    RETURNING balances ->> $2::text AS balance`,
      [userId, currency, value.toFixed()],
    );

    if (rows.length === 0) {
      throw new NotFoundException('User not found');
    }
    this.logger.log(
      `Credited ${value.toFixed()} ${currency} to user ${userId}`,
    );
    return this.normalize(rows[0].balance);
  }

  /**
   * Subtract a positive amount only if the balance covers it. The sufficiency
   * check and the debit are the same statement. Throws BadRequestException
   * ('Insufficient balance') without changing anything otherwise.
   */
  async debit(
    userId: string,
    currency: string,
    amount: Decimal.Value,
    manager?: Executor,
  ): Promise<string> {
    const value = this.positiveAmount(amount);
    this.assertCurrency(currency);

    const rows = await this.run(
      manager,
      `UPDATE users
          SET balances = jsonb_set(
                COALESCE(balances, '{}'::jsonb),
                ARRAY[$2::text],
                to_jsonb(
                  COALESCE((balances ->> $2::text)::numeric, 0) - $3::numeric
                ),
                true
              )
        WHERE id = $1
          AND COALESCE((balances ->> $2::text)::numeric, 0) >= $3::numeric
    RETURNING balances ->> $2::text AS balance`,
      [userId, currency, value.toFixed()],
    );

    if (rows.length === 0) {
      // Zero rows means either no such user or not enough funds.
      const exists: unknown[] = await this.executor(manager).query(
        'SELECT 1 FROM users WHERE id = $1',
        [userId],
      );
      if (exists.length === 0) {
        throw new NotFoundException('User not found');
      }
      throw new BadRequestException('Insufficient balance');
    }
    this.logger.log(
      `Debited ${value.toFixed()} ${currency} from user ${userId}`,
    );
    return this.normalize(rows[0].balance);
  }

  /**
   * Signed adjustment: positive credits, negative debits (guarded), zero is a
   * no-op that returns the current balance.
   */
  async applyDelta(
    userId: string,
    currency: string,
    delta: Decimal.Value,
    manager?: Executor,
  ): Promise<string> {
    const value = toDecimal(delta);
    if (value.isZero()) {
      return this.getBalance(userId, currency, manager);
    }
    return value.isPositive()
      ? this.credit(userId, currency, value, manager)
      : this.debit(userId, currency, value.abs(), manager);
  }

  private executor(manager?: Executor): Executor {
    return manager ?? this.dataSource;
  }

  private async run(
    manager: Executor | undefined,
    sql: string,
    params: unknown[],
  ): Promise<Array<{ balance: string }>> {
    const result: unknown = await this.executor(manager).query(sql, params);
    // TypeORM's postgres driver returns [rows, affectedCount] for UPDATE.
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return result[0] as Array<{ balance: string }>;
    }
    return (result as Array<{ balance: string }>) ?? [];
  }

  private positiveAmount(amount: Decimal.Value): Decimal {
    let value: Decimal;
    try {
      value = toDecimal(amount);
    } catch {
      throw new BadRequestException('Invalid amount');
    }
    if (!value.isPositive() || value.isZero()) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    return value;
  }

  private assertCurrency(currency: string): void {
    if (typeof currency !== 'string' || currency.length === 0) {
      throw new BadRequestException('Currency is required');
    }
  }

  private normalize(raw: string | null | undefined): string {
    return toDecimal(raw ?? '0').toFixed();
  }
}
