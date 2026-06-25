import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import {
  SavingsVault,
  SavingsVaultStatus,
  AutoDepositFrequency,
} from './entities/savings-vault.entity';
import {
  VaultTransaction,
  VaultTransactionType,
} from './entities/vault-transaction.entity';
import { CreateVaultDto } from './dto/create-vault.dto';
import { VaultResponseDto, VaultTransactionItemDto } from './dto/vault-response.dto';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class VaultsService {
  private readonly logger = new Logger(VaultsService.name);
  private readonly defaultInterestRate: number;
  private readonly defaultPenaltyPercent: number;

  constructor(
    @InjectRepository(SavingsVault)
    private readonly vaultRepository: Repository<SavingsVault>,
    @InjectRepository(VaultTransaction)
    private readonly txRepository: Repository<VaultTransaction>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.defaultInterestRate =
      this.configService.get<number>('VAULT_INTEREST_RATE') ?? 0.05;
    this.defaultPenaltyPercent =
      this.configService.get<number>('VAULT_EARLY_WITHDRAWAL_PENALTY') ?? 0.10;
  }

  async create(userId: string, dto: CreateVaultDto): Promise<SavingsVault> {
    const vault = this.vaultRepository.create({
      userId,
      name: dto.name,
      currency: dto.currency,
      targetAmount: dto.targetAmount.toFixed(8),
      unlockAt: new Date(dto.unlockAt),
      annualInterestRate: this.defaultInterestRate.toFixed(4),
      earlyWithdrawalPenaltyPercent: this.defaultPenaltyPercent.toFixed(4),
      autoDepositAmount: dto.autoDepositAmount
        ? dto.autoDepositAmount.toFixed(8)
        : null,
      autoDepositFrequency: dto.autoDepositFrequency ?? null,
    });

    return this.vaultRepository.save(vault);
  }

  async deposit(
    vaultId: string,
    userId: string,
    amount: number,
  ): Promise<{ vault: SavingsVault; transaction: VaultTransaction }> {
    const vault = await this.findOwnedVault(vaultId, userId);

    if (vault.status !== SavingsVaultStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot deposit into a vault that is ${vault.status}`,
      );
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentBalance = parseFloat(
      user.balances?.[vault.currency]?.toString() || '0',
    );
    if (currentBalance < amount) {
      throw new BadRequestException(
        `Insufficient ${vault.currency} balance in main wallet. ` +
          `You have ${currentBalance} ${vault.currency} but need ${amount}.`,
      );
    }

    const vaultBalanceBefore = parseFloat(vault.currentBalance);
    const vaultBalanceAfter = vaultBalanceBefore + amount;
    const newUserBalance = currentBalance - amount;

    return this.dataSource.transaction(async (manager) => {
      const vaultRepo = manager.getRepository(SavingsVault);
      const txRepo = manager.getRepository(VaultTransaction);

      await vaultRepo.update(vaultId, {
        currentBalance: vaultBalanceAfter.toFixed(8),
      });

      const tx = txRepo.create({
        vaultId,
        type: VaultTransactionType.DEPOSIT,
        amount: amount.toFixed(8),
        balanceBefore: vaultBalanceBefore.toFixed(8),
        balanceAfter: vaultBalanceAfter.toFixed(8),
      });
      const savedTx = await txRepo.save(tx);

      const updatedBalances = {
        ...user.balances,
        [vault.currency]: newUserBalance,
      };
      await this.usersService.update(userId, { balances: updatedBalances });

      const updatedVault = await vaultRepo.findOne({ where: { id: vaultId } });

      return { vault: updatedVault!, transaction: savedTx };
    });
  }

  async withdraw(
    vaultId: string,
    userId: string,
  ): Promise<{ vault: SavingsVault; transactions: VaultTransaction[] }> {
    const vault = await this.findOwnedVault(vaultId, userId);

    if (vault.status === SavingsVaultStatus.CLOSED || vault.status === SavingsVaultStatus.BROKEN) {
      throw new BadRequestException(
        `Vault has already been withdrawn (status: ${vault.status})`,
      );
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const vaultBalance = parseFloat(vault.currentBalance);
    if (vaultBalance <= 0) {
      throw new BadRequestException('Vault balance is zero, nothing to withdraw');
    }

    let totalCredit = vaultBalance;
    let penaltyAmount = 0;
    let penaltyPercent = 0;
    let interestCredit = 0;
    let newStatus = SavingsVaultStatus.CLOSED;
    const transactions: VaultTransaction[] = [];

    const now = new Date();
    const isEarly = now < new Date(vault.unlockAt);

    if (isEarly && vault.status === SavingsVaultStatus.ACTIVE) {
      penaltyPercent = parseFloat(vault.earlyWithdrawalPenaltyPercent);
      penaltyAmount = vaultBalance * penaltyPercent;
      totalCredit = vaultBalance - penaltyAmount;
      newStatus = SavingsVaultStatus.BROKEN;
    }

    if (!isEarly && vault.status === SavingsVaultStatus.ACTIVE) {
      interestCredit = parseFloat(vault.accruedInterest);
      totalCredit += interestCredit;
    }

    return this.dataSource.transaction(async (manager) => {
      const vaultRepo = manager.getRepository(SavingsVault);
      const txRepo = manager.getRepository(VaultTransaction);

      if (penaltyAmount > 0) {
        const penaltyTx = txRepo.create({
          vaultId,
          type: VaultTransactionType.PENALTY,
          amount: penaltyAmount.toFixed(8),
          balanceBefore: vaultBalance.toFixed(8),
          balanceAfter: (vaultBalance - penaltyAmount).toFixed(8),
          note: `Early withdrawal penalty (${(penaltyPercent * 100).toFixed(2)}%)`,
        });
        const savedPenalty = await txRepo.save(penaltyTx);
        transactions.push(savedPenalty);
      }

      if (interestCredit > 0) {
        const interestTx = txRepo.create({
          vaultId,
          type: VaultTransactionType.INTEREST,
          amount: interestCredit.toFixed(8),
          balanceBefore: vaultBalance.toFixed(8),
          balanceAfter: (vaultBalance + interestCredit).toFixed(8),
          note: 'Interest credited at withdrawal (past unlock date)',
        });
        const savedInterest = await txRepo.save(interestTx);
        transactions.push(savedInterest);
      }

      const effectiveBalance = vaultBalance + interestCredit;
      const afterPenalty = effectiveBalance - penaltyAmount;

      const withdrawTx = txRepo.create({
        vaultId,
        type: VaultTransactionType.WITHDRAWAL,
        amount: afterPenalty.toFixed(8),
        balanceBefore: effectiveBalance.toFixed(8),
        balanceAfter: '0',
      });
      const savedWithdraw = await txRepo.save(withdrawTx);
      transactions.push(savedWithdraw);

      await vaultRepo.update(vaultId, {
        currentBalance: '0',
        accruedInterest: '0',
        status: newStatus,
        closedAt: now,
      });

      const currentBal = parseFloat(
        user.balances?.[vault.currency]?.toString() || '0',
      );
      const updatedBalances = {
        ...user.balances,
        [vault.currency]: currentBal + totalCredit,
      };
      await this.usersService.update(userId, { balances: updatedBalances });

      const updatedVault = await vaultRepo.findOne({ where: { id: vaultId } });

      await this.notificationsService.create({
        userId,
        type: NotificationType.TRANSACTION,
        title: isEarly ? 'Vault Withdrawn Early — Penalty Applied' : 'Vault Withdrawn',
        message: isEarly
          ? `Early withdrawal from "${vault.name}". ` +
            `Withdrew ${totalCredit.toFixed(2)} ${vault.currency}. ` +
            `Penalty of ${penaltyAmount.toFixed(2)} ${vault.currency} applied (${(penaltyPercent * 100).toFixed(2)}%).`
          : `Successfully withdrew ${totalCredit.toFixed(2)} ${vault.currency} from vault "${vault.name}".`,
        relatedId: vaultId,
        metadata: { vaultId, amount: totalCredit, penalty: penaltyAmount, currency: vault.currency },
      });

      return { vault: updatedVault!, transactions };
    });
  }

  async findAll(userId: string): Promise<VaultResponseDto[]> {
    const vaults = await this.vaultRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return vaults.map((v) => this.toResponseDto(v));
  }

  async findOne(
    vaultId: string,
    userId: string,
  ): Promise<VaultResponseDto> {
    const vault = await this.vaultRepository.findOne({
      where: { id: vaultId, userId },
      relations: ['transactions'],
      order: { transactions: { createdAt: 'DESC' } as any },
    });

    if (!vault) {
      throw new NotFoundException('Vault not found');
    }

    return this.toResponseDto(vault);
  }

  async delete(vaultId: string, userId: string): Promise<void> {
    const vault = await this.findOwnedVault(vaultId, userId);

    if (vault.status === SavingsVaultStatus.ACTIVE) {
      throw new UnprocessableEntityException(
        'Cannot delete an active vault. Withdraw or wait for maturity first.',
      );
    }

    if (vault.status === SavingsVaultStatus.BROKEN) {
      throw new UnprocessableEntityException(
        'Cannot delete a broken vault. Withdraw the remaining balance first.',
      );
    }

    await this.vaultRepository.delete(vaultId);
  }

  async accrueInterest(): Promise<number> {
    const activeVaults = await this.vaultRepository.find({
      where: { status: SavingsVaultStatus.ACTIVE },
    });

    let processedCount = 0;

    for (const vault of activeVaults) {
      try {
        const annualRate = parseFloat(vault.annualInterestRate);
        const balance = parseFloat(vault.currentBalance);
        if (balance <= 0) continue;

        const dailyInterest = (annualRate / 365) * balance;

        await this.dataSource.transaction(async (manager) => {
          const vaultRepo = manager.getRepository(SavingsVault);
          const txRepo = manager.getRepository(VaultTransaction);

          const currentAccrued = parseFloat(vault.accruedInterest);
          await vaultRepo.update(vault.id, {
            accruedInterest: (currentAccrued + dailyInterest).toFixed(8),
          });

          const tx = txRepo.create({
            vaultId: vault.id,
            type: VaultTransactionType.INTEREST,
            amount: dailyInterest.toFixed(8),
            balanceBefore: balance.toFixed(8),
            balanceAfter: balance.toFixed(8),
            note: `Daily interest accrual (${(annualRate * 100).toFixed(2)}% APR)`,
          });
          await txRepo.save(tx);
        });

        processedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to accrue interest for vault ${vault.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return processedCount;
  }

  async processMaturity(): Promise<number> {
    const maturingVaults = await this.vaultRepository
      .createQueryBuilder('vault')
      .where('vault.status = :status', { status: SavingsVaultStatus.ACTIVE })
      .andWhere('vault.unlockAt <= NOW()')
      .getMany();

    let maturedCount = 0;

    for (const vault of maturingVaults) {
      try {
        const accrued = parseFloat(vault.accruedInterest);
        const currentBalance = parseFloat(vault.currentBalance);
        const newBalance = currentBalance + accrued;

        await this.dataSource.transaction(async (manager) => {
          const vaultRepo = manager.getRepository(SavingsVault);
          const txRepo = manager.getRepository(VaultTransaction);

          await vaultRepo.update(vault.id, {
            currentBalance: newBalance.toFixed(8),
            accruedInterest: '0',
            status: SavingsVaultStatus.MATURED,
            maturedAt: new Date(),
          });

          if (accrued > 0) {
            const tx = txRepo.create({
              vaultId: vault.id,
              type: VaultTransactionType.INTEREST,
              amount: accrued.toFixed(8),
              balanceBefore: currentBalance.toFixed(8),
              balanceAfter: newBalance.toFixed(8),
              note: 'Interest credited at maturity',
            });
            await txRepo.save(tx);
          }
        });

        await this.notificationsService.create({
          userId: vault.userId,
          type: NotificationType.TRANSACTION,
          title: 'Vault Matured!',
          message:
            `Your savings vault "${vault.name}" has matured! ` +
            `Final balance: ${newBalance.toFixed(2)} ${vault.currency} ` +
            `(including ${accrued.toFixed(2)} ${vault.currency} in interest). ` +
            `You can now withdraw your funds.`,
          relatedId: vault.id,
          metadata: {
            vaultId: vault.id,
            name: vault.name,
            finalBalance: newBalance,
            interestEarned: accrued,
            currency: vault.currency,
          },
        });

        maturedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to process maturity for vault ${vault.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return maturedCount;
  }

  async processAutoDeposits(): Promise<{ processed: number; skipped: number }> {
    const now = new Date();
    let processed = 0;
    let skipped = 0;

    const autoDepositVaults = await this.vaultRepository.find({
      where: { status: SavingsVaultStatus.ACTIVE },
    });

    for (const vault of autoDepositVaults) {
      try {
        if (!vault.autoDepositAmount || !vault.autoDepositFrequency) continue;

        if (!this.isAutoDepositDue(vault, now)) continue;

        const amount = parseFloat(vault.autoDepositAmount);

        const user = await this.usersService.findById(vault.userId);
        if (!user) {
          skipped++;
          continue;
        }

        const userBalance = parseFloat(
          user.balances?.[vault.currency]?.toString() || '0',
        );

        if (userBalance < amount) {
          skipped++;

          await this.notificationsService.create({
            userId: vault.userId,
            type: NotificationType.SYSTEM,
            title: 'Auto-Deposit Skipped',
            message:
              `Auto-deposit of ${amount.toFixed(2)} ${vault.currency} ` +
              `to vault "${vault.name}" was skipped due to insufficient wallet balance. ` +
              `Current balance: ${userBalance.toFixed(2)} ${vault.currency}.`,
            relatedId: vault.id,
            metadata: {
              vaultId: vault.id,
              amount,
              currency: vault.currency,
              reason: 'insufficient_balance',
            },
          });

          continue;
        }

        const vaultBalanceBefore = parseFloat(vault.currentBalance);
        const vaultBalanceAfter = vaultBalanceBefore + amount;
        const newUserBalance = userBalance - amount;

        await this.dataSource.transaction(async (manager) => {
          const vaultRepo = manager.getRepository(SavingsVault);
          const txRepo = manager.getRepository(VaultTransaction);

          await vaultRepo.update(vault.id, {
            currentBalance: vaultBalanceAfter.toFixed(8),
            autoDepositLastRun: now,
          });

          const tx = txRepo.create({
            vaultId: vault.id,
            type: VaultTransactionType.DEPOSIT,
            amount: amount.toFixed(8),
            balanceBefore: vaultBalanceBefore.toFixed(8),
            balanceAfter: vaultBalanceAfter.toFixed(8),
            note: 'Auto-deposit',
          });
          await txRepo.save(tx);

          const updatedBalances = {
            ...user.balances,
            [vault.currency]: newUserBalance,
          };
          await this.usersService.update(vault.userId, {
            balances: updatedBalances,
          });
        });

        processed++;
      } catch (error) {
        this.logger.error(
          `Failed to process auto-deposit for vault ${vault.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        skipped++;
      }
    }

    return { processed, skipped };
  }

  private isAutoDepositDue(
    vault: SavingsVault,
    now: Date,
  ): boolean {
    if (!vault.autoDepositLastRun) return true;

    const lastRun = new Date(vault.autoDepositLastRun);

    switch (vault.autoDepositFrequency) {
      case AutoDepositFrequency.DAILY: {
        const msSinceLastRun = now.getTime() - lastRun.getTime();
        return msSinceLastRun >= 24 * 60 * 60 * 1000;
      }
      case AutoDepositFrequency.WEEKLY: {
        const msSinceLastRun = now.getTime() - lastRun.getTime();
        return msSinceLastRun >= 7 * 24 * 60 * 60 * 1000;
      }
      case AutoDepositFrequency.MONTHLY: {
        const nextMonthly = new Date(lastRun);
        nextMonthly.setMonth(nextMonthly.getMonth() + 1);
        return now >= nextMonthly;
      }
      default:
        return false;
    }
  }

  private async findOwnedVault(
    vaultId: string,
    userId: string,
  ): Promise<SavingsVault> {
    const vault = await this.vaultRepository.findOne({
      where: { id: vaultId, userId },
    });

    if (!vault) {
      throw new NotFoundException('Vault not found');
    }

    return vault;
  }

  private toResponseDto(vault: SavingsVault): VaultResponseDto {
    const currentBalance = parseFloat(vault.currentBalance);
    const targetAmount = parseFloat(vault.targetAmount);
    const progressPercent =
      targetAmount > 0
        ? Math.min(100, Math.round((currentBalance / targetAmount) * 100))
        : 0;

    const dto: VaultResponseDto = {
      id: vault.id,
      userId: vault.userId,
      name: vault.name,
      currency: vault.currency,
      targetAmount: vault.targetAmount,
      currentBalance: vault.currentBalance,
      annualInterestRate: vault.annualInterestRate,
      accruedInterest: vault.accruedInterest,
      unlockAt: vault.unlockAt,
      status: vault.status,
      earlyWithdrawalPenaltyPercent: vault.earlyWithdrawalPenaltyPercent,
      autoDepositAmount: vault.autoDepositAmount,
      autoDepositFrequency: vault.autoDepositFrequency,
      progressPercent,
      createdAt: vault.createdAt,
      maturedAt: vault.maturedAt,
      closedAt: vault.closedAt,
    };

    if (vault.transactions) {
      dto.transactions = vault.transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        note: tx.note,
        createdAt: tx.createdAt,
      }));
    }

    return dto;
  }
}
