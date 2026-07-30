import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { ColdStorageAccount } from './entities/cold-storage-account.entity';
import { ColdStorageWithdrawal, ColdStorageWithdrawalStatus } from './entities/cold-storage-withdrawal.entity';
import { StellarService } from '../blockchain/stellar.service';
import { WalletsService } from '../wallets/wallets.service';
import { UsersService from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class ColdStorageService {
  private readonly logger = new Logger(ColdStorageService.name);

  constructor(
    @InjectRepository(ColdStorageAccount)
    private readonly coldStorageAccountRepo: Repository<ColdStorageAccount>,
    @InjectRepository(ColdStorageWithdrawal)
    private readonly coldStorageWithdrawalRepo: Repository<ColdStorageWithdrawal>,
    private readonly stellarService: StellarService,
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async setup(userId: string, currency: string, stellarPublicKey: string): Promise<ColdStorageAccount> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.kycTier !== 'ENHANCED') {
      throw new ForbiddenException('Enhanced KYC verification is required to set up a cold storage account');
    }

    const validKeyPattern = /^G[A-Z0-9]{55}$/;
    if (!validKeyPattern.test(stellarPublicKey)) {
      throw new BadRequestException('Invalid Stellar public key format. Must start with G and be 56 characters.');
    }

    const existingAccount = await this.coldStorageAccountRepo.findOne({
      where: { userId, currency },
    });
    if (existingAccount) {
      throw new BadRequestException('A cold storage account for this currency already exists');
    }

    const account = this.coldStorageAccountRepo.create({
      userId,
      currency,
      stellarPublicKey,
      balance: '0.00000000',
      pendingWithdrawals: '0.00000000',
      isVerified: false,
    });

    const savedAccount = await this.coldStorageAccountRepo.save(account);

    await this.auditLogsService.log({
      userId,
      action: 'COLD_STORAGE_ACCOUNT_SETUP',
      details: {
        coldStorageAccountId: savedAccount.id,
        currency,
        stellarPublicKey,
      },
    });

    this.logger.log(`Cold storage account created for user ${userId}, currency ${currency}`);
    return savedAccount;
  }

  async deposit(userId: string, currency: string, amount: string): Promise<ColdStorageAccount> {
    const account = await this.coldStorageAccountRepo.findOne({
      where: { userId, currency },
    });
    if (!account) {
      throw new NotFoundException('Cold storage account not found');
    }

    if (!account.isVerified) {
      throw new ForbiddenException('Cold storage account is not verified yet');
    }

    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      throw new BadRequestException('Invalid deposit amount');
    }

    if (depositAmount < 1000) {
      throw new BadRequestException('Minimum deposit amount is 1000');
    }

    const hotWalletBalance = await this.walletsService.getBalance(userId, currency);
    if (parseFloat(hotWalletBalance) < depositAmount) {
      throw new BadRequestException('Insufficient hot wallet balance');
    }

    await this.stellarService.sendPayment(
      account.stellarPublicKey,
      amount,
      currency,
    );

    const newBalance = (parseFloat(account.balance) + depositAmount).toFixed(8);
    account.balance = newBalance;
    await this.coldStorageAccountRepo.save(account);

    await this.auditLogsService.log({
      userId,
      action: 'COLD_STORAGE_DEPOSIT',
      details: {
        coldStorageAccountId: account.id,
        currency,
        amount,
        newBalance,
      },
    });

    this.logger.log(`Deposit of ${amount} ${currency} to cold storage for user ${userId}`);
    return account;
  }

  async requestWithdrawal(userId: string, amount: string): Promise<ColdStorageWithdrawal> {
    const account = await this.coldStorageAccountRepo.findOne({
      where: { userId },
    });
    if (!account) {
      throw new NotFoundException('Cold storage account not found');
    }

    const withdrawalAmount = parseFloat(amount);
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
      throw new BadRequestException('Invalid withdrawal amount');
    }

    const availableBalance = parseFloat(account.balance) - parseFloat(account.pendingWithdrawals);
    if (withdrawalAmount > availableBalance) {
      throw new BadRequestException(
        `Insufficient available balance. Available: ${availableBalance}, Requested: ${withdrawalAmount}`,
      );
    }

    const newPendingWithdrawals = (parseFloat(account.pendingWithdrawals) + withdrawalAmount).toFixed(8);
    account.pendingWithdrawals = newPendingWithdrawals;
    await this.coldStorageAccountRepo.save(account);

    const withdrawal = this.coldStorageWithdrawalRepo.create({
      coldStorageAccountId: account.id,
      userId,
      amount,
      status: ColdStorageWithdrawalStatus.PENDING_APPROVAL,
    });

    const savedWithdrawal = await this.coldStorageWithdrawalRepo.save(withdrawal);

    await this.auditLogsService.log({
      userId,
      action: 'COLD_STORAGE_WITHDRAWAL_REQUEST',
      details: {
        withdrawalId: savedWithdrawal.id,
        coldStorageAccountId: account.id,
        amount,
      },
    });

    this.logger.log(`Withdrawal request of ${amount} from cold storage for user ${userId}`);
    return savedWithdrawal;
  }

  async approveWithdrawal(withdrawalId: string, adminId: string): Promise<ColdStorageWithdrawal> {
    const withdrawal = await this.coldStorageWithdrawalRepo.findOne({
      where: { id: withdrawalId },
    });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }

    if (withdrawal.status !== ColdStorageWithdrawalStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Withdrawal cannot be approved. Current status: ${withdrawal.status}`,
      );
    }

    const now = new Date();
    const readyAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    withdrawal.status = ColdStorageWithdrawalStatus.WAITING_PERIOD;
    withdrawal.adminId = adminId;
    withdrawal.approvedAt = now;
    withdrawal.readyAt = readyAt;

    const savedWithdrawal = await this.coldStorageWithdrawalRepo.save(withdrawal);

    this.logger.log(`Withdrawal ${withdrawalId} approved by admin ${adminId}, ready at ${readyAt.toISOString()}`);
    return savedWithdrawal;
  }

  async confirmWithdrawal(userId: string, withdrawalId: string): Promise<ColdStorageWithdrawal> {
    const withdrawal = await this.coldStorageWithdrawalRepo.findOne({
      where: { id: withdrawalId, userId },
      relations: ['coldStorageAccount'],
    });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }

    if (withdrawal.status !== ColdStorageWithdrawalStatus.READY_TO_CONFIRM) {
      throw new BadRequestException(
        `Withdrawal is not ready to confirm. Current status: ${withdrawal.status}`,
      );
    }

    if (!withdrawal.readyAt || new Date() < withdrawal.readyAt) {
      throw new BadRequestException('Waiting period has not elapsed yet');
    }

    const account = withdrawal.coldStorageAccount;

    await this.stellarService.sendPayment(
      account.stellarPublicKey,
      withdrawal.amount,
      account.currency,
    );

    const newBalance = (parseFloat(account.balance) - parseFloat(withdrawal.amount)).toFixed(8);
    account.balance = newBalance;
    await this.coldStorageAccountRepo.save(account);

    const newPending = (parseFloat(account.pendingWithdrawals) - parseFloat(withdrawal.amount)).toFixed(8);
    account.pendingWithdrawals = newPending;
    await this.coldStorageAccountRepo.save(account);

    withdrawal.status = ColdStorageWithdrawalStatus.COMPLETED;
    withdrawal.completedAt = new Date();
    const savedWithdrawal = await this.coldStorageWithdrawalRepo.save(withdrawal);

    await this.auditLogsService.log({
      userId,
      action: 'COLD_STORAGE_WITHDRAWAL_CONFIRMED',
      details: {
        withdrawalId: savedWithdrawal.id,
        coldStorageAccountId: account.id,
        amount: withdrawal.amount,
      },
    });

    this.logger.log(`Withdrawal ${withdrawalId} confirmed and completed for user ${userId}`);
    return savedWithdrawal;
  }

  async getAllAccounts(): Promise<ColdStorageAccount[]> {
    return this.coldStorageAccountRepo.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async getPendingWithdrawals(): Promise<ColdStorageWithdrawal[]> {
    return this.coldStorageWithdrawalRepo.find({
      where: { status: ColdStorageWithdrawalStatus.PENDING_APPROVAL },
      relations: ['coldStorageAccount'],
      order: { createdAt: 'ASC' },
    });
  }

  async getUserAccounts(userId: string): Promise<ColdStorageAccount[]> {
    return this.coldStorageAccountRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
