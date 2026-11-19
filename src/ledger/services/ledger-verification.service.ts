import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { User, UserRole } from '../../users/user.entity';

export type LedgerVerificationStatus = 'BALANCED' | 'DISCREPANCY';

export interface LedgerVerificationDiscrepancy {
  userId: string;
  currency: string;
  amountDelta: string;
}

export interface LedgerVerificationResult {
  status: LedgerVerificationStatus;
  discrepancies: LedgerVerificationDiscrepancy[];
}

export interface LedgerBalanceRow {
  currency: string;
  accountType: string;
  balance: string;
}

@Injectable()
export class LedgerVerificationService {
  private readonly logger = new Logger(LedgerVerificationService.name);

  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository: Repository<LedgerEntry>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async verify(): Promise<LedgerVerificationResult> {
    const rows: LedgerVerificationDiscrepancy[] =
      await this.ledgerEntryRepository.query(`
        WITH ledger_balances AS (
          SELECT
            "userId",
            currency,
            SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) AS amount
          FROM ledger_entries
          WHERE "accountType" = 'USER' AND "userId" IS NOT NULL
          GROUP BY "userId", currency
        ),
        stored_balances AS (
          SELECT
            users.id AS "userId",
            balance.currency,
            balance.amount::numeric AS amount
          FROM users
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(users.balances, '{}'::jsonb)
          ) AS balance(currency, amount)
        )
        SELECT
          COALESCE(ledger_balances."userId", stored_balances."userId") AS "userId",
          COALESCE(ledger_balances.currency, stored_balances.currency) AS currency,
          (
            COALESCE(ledger_balances.amount, 0) -
            COALESCE(stored_balances.amount, 0)
          )::text AS "amountDelta"
        FROM ledger_balances
        FULL OUTER JOIN stored_balances
          ON ledger_balances."userId" = stored_balances."userId"
         AND ledger_balances.currency = stored_balances.currency
        WHERE COALESCE(ledger_balances.amount, 0) <>
              COALESCE(stored_balances.amount, 0)
        ORDER BY "userId" ASC, currency ASC
      `);

    if (rows.length === 0) {
      return { status: 'BALANCED', discrepancies: [] };
    }

    const result: LedgerVerificationResult = {
      status: 'DISCREPANCY',
      discrepancies: rows,
    };

    await this.notifyAdmins(result);

    return result;
  }

  async getEntries(transactionId?: string): Promise<LedgerEntry[]> {
    if (!transactionId) {
      throw new BadRequestException('transactionId is required');
    }

    return this.ledgerEntryRepository.find({
      where: { transactionId },
      order: { createdAt: 'ASC' },
    });
  }

  async getBalances(): Promise<LedgerBalanceRow[]> {
    return this.ledgerEntryRepository.query(`
      SELECT
        currency,
        "accountType" AS "accountType",
        COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)::text AS balance
      FROM ledger_entries
      GROUP BY currency, "accountType"
      ORDER BY currency ASC, "accountType" ASC
    `);
  }

  private async notifyAdmins(result: LedgerVerificationResult): Promise<void> {
    const admins = await this.userRepository.find({
      where: [{ role: UserRole.ADMIN }, { role: UserRole.SUPER_ADMIN }],
    });

    if (admins.length === 0) {
      this.logger.warn(
        'Ledger discrepancy detected, but no admins were found to notify',
      );
      return;
    }

    const message =
      'Ledger verification found a discrepancy: ' +
      result.discrepancies
        .map(
          (item) =>
            `${item.userId}/${item.currency}=${item.amountDelta}`,
        )
        .join(', ');

    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.dispatch(
          admin.id,
          NotificationType.SECURITY_ALERT,
          'Ledger discrepancy detected',
          message,
          result as any,
        ),
      ),
    );
  }
}
