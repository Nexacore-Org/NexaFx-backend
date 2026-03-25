import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncryptionService } from '../../../common/services/encryption.service';
import {
  NotificationType,
  NotificationStatus,
  Notification,
} from '../../../notifications/entities/notification.entity';
import { UsersService } from '../../../users/users.service';
import { CurrenciesService } from '../../../currencies/currencies.service';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../../transactions/entities/transaction.entity';
import { AuditLogsService } from '../../../audit-logs/audit-logs.service';
import {
  PaymentRailSettlementStatus,
  PaymentRailWebhookDto,
} from '../dto/payment-rail-webhook.dto';
import { LinkBankAccountDto } from '../dto/link-bank-account.dto';
import { VerifyBankAccountDto } from '../dto/verify-bank-account.dto';
import {
  CreateBankDepositDto,
  CreateBankWithdrawalDto,
} from '../dto/bank-transfer.dto';
import { BankAccount, BankAccountStatus } from '../entities/bank-account.entity';
import { PaymentRailService } from './payment-rail.service';

@Injectable()
export class BankAccountService {
  private readonly logger = new Logger(BankAccountService.name);

  constructor(
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly usersService: UsersService,
    private readonly currenciesService: CurrenciesService,
    private readonly encryptionService: EncryptionService,
    private readonly paymentRailService: PaymentRailService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async linkBankAccount(userId: string, dto: LinkBankAccountDto) {
    const microDeposit1 = this.randomMicroDeposit();
    let microDeposit2 = this.randomMicroDeposit();

    while (microDeposit2 === microDeposit1) {
      microDeposit2 = this.randomMicroDeposit();
    }

    const account = this.bankAccountRepository.create({
      userId,
      bankName: dto.bankName.trim(),
      accountHolderName: dto.accountHolderName.trim(),
      accountNumberEncrypted: this.encryptionService.encrypt(dto.accountNumber),
      accountNumberLast4: dto.accountNumber.slice(-4),
      routingNumber: dto.routingNumber.trim(),
      status: BankAccountStatus.PENDING_VERIFICATION,
      microDeposit1: microDeposit1.toFixed(2),
      microDeposit2: microDeposit2.toFixed(2),
    });

    const saved = await this.bankAccountRepository.save(account);
    const verification = this.paymentRailService.initiateMicroDepositVerification(
      saved.id,
    );
    saved.verificationReference = verification.reference;
    await this.bankAccountRepository.save(saved);

    await this.auditLogsService.logWalletEvent(userId, 'BANK_ACCOUNT_LINKED', saved.id, {
      bankName: saved.bankName,
      accountNumberLast4: saved.accountNumberLast4,
      verificationReference: saved.verificationReference,
    });

    return this.toResponse(saved);
  }

  async verifyBankAccount(
    userId: string,
    bankAccountId: string,
    dto: VerifyBankAccountDto,
  ) {
    const account = await this.getOwnedBankAccount(userId, bankAccountId);
    if (account.status !== BankAccountStatus.PENDING_VERIFICATION) {
      throw new BadRequestException('Bank account is not awaiting verification');
    }

    const expected = [account.microDeposit1, account.microDeposit2]
      .map((value) => Number(value).toFixed(2))
      .sort();
    const provided = [dto.amount1, dto.amount2]
      .map((value) => Number(value).toFixed(2))
      .sort();

    if (expected[0] !== provided[0] || expected[1] !== provided[1]) {
      throw new BadRequestException('Micro-deposit verification amounts do not match');
    }

    account.status = BankAccountStatus.ACTIVE;
    account.verifiedAt = new Date();
    const saved = await this.bankAccountRepository.save(account);

    await this.createNotification(userId, 'Bank account verified', `${saved.bankName} ending in ${saved.accountNumberLast4} is now active.`);
    await this.auditLogsService.logWalletEvent(userId, 'BANK_ACCOUNT_VERIFIED', saved.id, {
      bankName: saved.bankName,
      accountNumberLast4: saved.accountNumberLast4,
    });

    return this.toResponse(saved);
  }

  async createBankDeposit(userId: string, dto: CreateBankDepositDto) {
    const account = await this.requireActiveBankAccount(userId, dto.bankAccountId);
    const currency = dto.currency.toUpperCase();
    await this.currenciesService.getCurrency(currency);

    const reference = this.paymentRailService.buildSettlementReference('deposit');
    const transaction = this.transactionRepository.create({
      userId,
      type: TransactionType.DEPOSIT,
      amount: dto.amount.toFixed(8),
      currency,
      status: TransactionStatus.PENDING,
      bankAccountId: account.id,
      rail: 'BANK',
      externalReference: reference,
      metadata: {
        bankName: account.bankName,
        accountNumberLast4: account.accountNumberLast4,
        settlementState: 'PENDING',
      },
    });

    const saved = await this.transactionRepository.save(transaction);

    this.paymentRailService.scheduleSettlement(saved.id, reference, async (payload) => {
      await this.applySettlementWebhook(payload);
    });

    await this.auditLogsService.logTransactionEvent(userId, 'BANK_DEPOSIT_INITIATED', saved.id, {
      bankAccountId: account.id,
      amount: dto.amount,
      currency,
      reference,
    });

    return saved;
  }

  async createBankWithdrawal(userId: string, dto: CreateBankWithdrawalDto) {
    const account = await this.requireActiveBankAccount(userId, dto.bankAccountId);
    const currency = dto.currency.toUpperCase();
    await this.currenciesService.getCurrency(currency);

    await this.reserveBalance(userId, currency, dto.amount);

    const reference = this.paymentRailService.buildSettlementReference('withdrawal');
    const transaction = this.transactionRepository.create({
      userId,
      type: TransactionType.WITHDRAW,
      amount: dto.amount.toFixed(8),
      currency,
      status: TransactionStatus.PENDING,
      bankAccountId: account.id,
      rail: 'BANK',
      externalReference: reference,
      reservedBalanceAmount: dto.amount.toFixed(8),
      metadata: {
        bankName: account.bankName,
        accountNumberLast4: account.accountNumberLast4,
        settlementState: 'PENDING',
        balanceReserved: true,
      },
    });

    const saved = await this.transactionRepository.save(transaction);

    this.paymentRailService.scheduleSettlement(saved.id, reference, async (payload) => {
      await this.applySettlementWebhook(payload);
    });

    await this.auditLogsService.logTransactionEvent(
      userId,
      'BANK_WITHDRAWAL_INITIATED',
      saved.id,
      {
        bankAccountId: account.id,
        amount: dto.amount,
        currency,
        reference,
      },
    );

    return saved;
  }

  async applySettlementWebhook(dto: PaymentRailWebhookDto) {
    const transaction = await this.transactionRepository.findOne({
      where: { externalReference: dto.reference },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction for settlement reference not found');
    }

    if (transaction.status !== TransactionStatus.PENDING) {
      return transaction;
    }

    if (dto.status === PaymentRailSettlementStatus.COMPLETED) {
      await this.handleCompletedSettlement(transaction);
    } else {
      await this.handleFailedSettlement(transaction, dto.failureReason);
    }

    return this.transactionRepository.save(transaction);
  }

  private async handleCompletedSettlement(transaction: Transaction) {
    transaction.status = TransactionStatus.COMPLETED;
    transaction.failureReason = null;
    transaction.metadata = {
      ...(transaction.metadata ?? {}),
      settlementState: PaymentRailSettlementStatus.COMPLETED,
      settledAt: new Date().toISOString(),
    };

    if (transaction.type === TransactionType.DEPOSIT) {
      await this.applyBalanceDelta(
        transaction.userId,
        transaction.currency,
        Number(transaction.amount),
      );
      await this.createNotification(
        transaction.userId,
        'Bank deposit completed',
        `Your bank deposit of ${transaction.amount} ${transaction.currency} has settled successfully.`,
      );
    } else {
      transaction.reservedBalanceAmount = null;
      transaction.metadata = {
        ...(transaction.metadata ?? {}),
        settlementState: PaymentRailSettlementStatus.COMPLETED,
        balanceReserved: false,
        settledAt: new Date().toISOString(),
      };
      await this.createNotification(
        transaction.userId,
        'Bank withdrawal completed',
        `Your bank withdrawal of ${transaction.amount} ${transaction.currency} has settled successfully.`,
      );
    }
  }

  private async handleFailedSettlement(
    transaction: Transaction,
    failureReason?: string,
  ) {
    transaction.status = TransactionStatus.FAILED;
    transaction.failureReason = failureReason || 'Payment rail settlement failed';

    const metadata = {
      ...(transaction.metadata ?? {}),
      settlementState: PaymentRailSettlementStatus.FAILED,
      failedAt: new Date().toISOString(),
    } as Record<string, unknown>;

    if (
      transaction.type === TransactionType.WITHDRAW &&
      transaction.reservedBalanceAmount
    ) {
      await this.applyBalanceDelta(
        transaction.userId,
        transaction.currency,
        Number(transaction.reservedBalanceAmount),
      );
      transaction.reservedBalanceAmount = null;
      metadata.balanceReserved = false;
      metadata.reversedReservation = true;
    }

    transaction.metadata = metadata;

    await this.createNotification(
      transaction.userId,
      `Bank ${transaction.type === TransactionType.DEPOSIT ? 'deposit' : 'withdrawal'} failed`,
      `Your bank ${transaction.type === TransactionType.DEPOSIT ? 'deposit' : 'withdrawal'} of ${transaction.amount} ${transaction.currency} failed${failureReason ? `: ${failureReason}` : '.'}`,
    );
  }

  private async requireActiveBankAccount(userId: string, bankAccountId: string) {
    const account = await this.getOwnedBankAccount(userId, bankAccountId);
    if (account.status !== BankAccountStatus.ACTIVE) {
      throw new BadRequestException('Bank account must be verified before use');
    }
    return account;
  }

  private async getOwnedBankAccount(userId: string, bankAccountId: string) {
    const account = await this.bankAccountRepository.findOne({
      where: { id: bankAccountId, userId },
    });
    if (!account) {
      throw new NotFoundException('Bank account not found');
    }
    return account;
  }

  private async reserveBalance(userId: string, currency: string, amount: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentBalance = Number(user.balances?.[currency] ?? 0);
    if (currentBalance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const balances = { ...(user.balances ?? {}) };
    balances[currency] = Number((currentBalance - amount).toFixed(8));
    await this.usersService.updateByUserId(userId, { balances });
  }

  private async applyBalanceDelta(
    userId: string,
    currency: string,
    delta: number,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentBalance = Number(user.balances?.[currency] ?? 0);
    const balances = { ...(user.balances ?? {}) };
    balances[currency] = Number((currentBalance + delta).toFixed(8));
    await this.usersService.updateByUserId(userId, { balances });
  }

  private async createNotification(userId: string, title: string, message: string) {
    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId,
        type: NotificationType.SYSTEM,
        title,
        message,
        status: NotificationStatus.UNREAD,
      }),
    );
  }

  private toResponse(account: BankAccount) {
    return {
      id: account.id,
      bankName: account.bankName,
      accountHolderName: account.accountHolderName,
      accountNumberLast4: account.accountNumberLast4,
      routingNumber: account.routingNumber,
      status: account.status,
      verificationReference: account.verificationReference,
      verifiedAt: account.verifiedAt,
      createdAt: account.createdAt,
    };
  }

  private randomMicroDeposit() {
    return Number((Math.floor(Math.random() * 99) + 1) / 100);
  }
}
