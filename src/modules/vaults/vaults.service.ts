import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import {
  SavingsVault,
  VaultStatus,
  AutoDepositFrequency,
} from './entities/savings-vault.entity';
import {
  VaultTransaction,
  VaultTransactionType,
} from './entities/vault-transaction.entity';
import { CreateVaultDto } from './dto/create-vault.dto';
import { DepositDto } from './dto/deposit.dto';
import { UsersService } from '../../users/users.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/enum/notificationType.enum';

@Injectable()
export class VaultsService {
  private readonly logger = new Logger(VaultsService.name);
  private readonly defaultInterestRate: number;

  constructor(
    @InjectRepository(SavingsVault)
    private readonly vaultRepository: Repository<SavingsVault>,
    @InjectRepository(VaultTransaction)
    private readonly transactionRepository: Repository<VaultTransaction>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.defaultInterestRate =
      this.configService.get<number>('VAULT_INTEREST_RATE') ?? 0.05;
  }

  async create(userId: string, dto: CreateVaultDto): Promise<SavingsVault> {
    const vault = this.vaultRepository.create({
      userId,
      name: dto.name,
      currency: dto.currency.toUpperCase(),
      targetAmount: dto.targetAmount.toString(),
      unlockAt: new Date(dto.unlockAt),
      annualInterestRate: this.defaultInterestRate.toString(),
      earlyWithdrawalPenaltyPercent: '0.10',
      autoDepositAmount: dto.autoDepositAmount?.toString() ?? null,
      autoDepositFrequency: dto.autoDepositFrequency ?? null,
    });

    return this.vaultRepository.save(vault);
  }

  async deposit(
    userId: string,
    vaultId: string,
    dto: DepositDto,
  ): Promise<VaultTransaction> {
    const vault = await this.findOwnedVault(userId, vaultId);

    if (vault.status !== VaultStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot deposit into a vault with status ${vault.status}`,
      );
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const amount = dto.amount.toString();
    const userBalance = parseFloat(user.balances?.[vault.currency]?.toString() ?? '0');
    const depositAmount = parseFloat(amount);

    if (userBalance < depositAmount) {
      throw new BadRequestException(
        `Insufficient ${vault.currency} balance in main wallet`,
      );
    }

    const balanceBefore = parseFloat(vault.currentBalance);
    const balanceAfter = balanceBefore + depositAmount;

    return this.dataSource.transaction(async (manager) => {
      user.balances[vault.currency] = userBalance - depositAmount;
      await manager.save(user);

      await manager.update(SavingsVault, vault.id, {
        currentBalance: balanceAfter.toString(),
      });

      const tx = this.transactionRepository.create({
        vaultId: vault.id,
        type: VaultTransactionType.DEPOSIT,
        amount: amount,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        note: dto.note ?? null,
      });

      return manager.save(tx);
    });
  }

  async withdraw(userId: string, vaultId: string): Promise<VaultTransaction> {
    const vault = await this.findOwnedVault(userId, vaultId);

    if (vault.status === VaultStatus.CLOSED) {
      throw new BadRequestException('Vault has already been withdrawn');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentBalance = parseFloat(vault.currentBalance);
    if (currentBalance <= 0) {
      throw new BadRequestException('Vault balance is zero');
    }

    return this.dataSource.transaction(async (manager) => {
      let withdrawAmount = currentBalance;
      let penaltyAmount = 0;

      const isEarly =
        vault.status === VaultStatus.ACTIVE && new Date() < new Date(vault.unlockAt);

      if (isEarly) {
        const penaltyPercent = parseFloat(vault.earlyWithdrawalPenaltyPercent);
        penaltyAmount = currentBalance * penaltyPercent;
        withdrawAmount = currentBalance - penaltyAmount;

        if (penaltyAmount > 0) {
          const penaltyTx = this.transactionRepository.create({
            vaultId: vault.id,
            type: VaultTransactionType.PENALTY,
            amount: penaltyAmount.toFixed(8),
            balanceBefore: currentBalance.toString(),
            balanceAfter: (currentBalance - penaltyAmount).toString(),
            note: `Early withdrawal penalty (${(parseFloat(vault.earlyWithdrawalPenaltyPercent) * 100).toFixed(0)}%)`,
          });
          await manager.save(penaltyTx);
        }

        await manager.update(SavingsVault, vault.id, {
          status: VaultStatus.BROKEN,
          currentBalance: '0',
          closedAt: new Date(),
        });
      } else {
        const totalBalance =
          currentBalance + parseFloat(vault.accruedInterest);
        withdrawAmount = totalBalance;

        await manager.update(SavingsVault, vault.id, {
          status: VaultStatus.CLOSED,
          currentBalance: '0',
          accruedInterest: '0',
          closedAt: new Date(),
        });
      }

      const userCurrencyBalance = parseFloat(
        user.balances?.[vault.currency]?.toString() ?? '0',
      );
      user.balances[vault.currency] = userCurrencyBalance + withdrawAmount;
      await manager.save(user);

      const tx = this.transactionRepository.create({
        vaultId: vault.id,
        type: VaultTransactionType.WITHDRAWAL,
        amount: withdrawAmount.toFixed(8),
        balanceBefore: currentBalance.toString(),
        balanceAfter: '0',
        note: isEarly
          ? `Early withdrawal (penalty: ${penaltyAmount.toFixed(8)} ${vault.currency})`
          : 'Matured withdrawal',
      });

      return manager.save(tx);
    });
  }

  async findAll(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<{ data: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const [vaults, total] = await this.vaultRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = vaults.map((v) => this.mapWithProgress(v));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(userId: string, vaultId: string) {
    const vault = await this.vaultRepository.findOne({
      where: { id: vaultId, userId },
      relations: ['transactions'],
      order: { transactions: { createdAt: 'DESC' } },
    });

    if (!vault) {
      throw new NotFoundException('Vault not found');
    }

    return {
      ...this.mapWithProgress(vault),
      transactions: vault.transactions,
    };
  }

  async delete(userId: string, vaultId: string): Promise<void> {
    const vault = await this.findOwnedVault(userId, vaultId);

    if (vault.status === VaultStatus.ACTIVE || vault.status === VaultStatus.BROKEN) {
      throw new UnprocessableEntityException(
        'Cannot delete an active or broken vault. Withdraw funds first.',
      );
    }

    await this.vaultRepository.remove(vault);
  }

  async accrueInterest(): Promise<number> {
    const vaults = await this.vaultRepository.find({
      where: { status: VaultStatus.ACTIVE },
    });

    let count = 0;

    for (const vault of vaults) {
      const annualRate = parseFloat(vault.annualInterestRate);
      const balance = parseFloat(vault.currentBalance);
      const dailyInterest = (annualRate / 365) * balance;

      if (dailyInterest <= 0) continue;

      const newAccrued =
        parseFloat(vault.accruedInterest) + dailyInterest;

      await this.dataSource.transaction(async (manager) => {
        await manager.update(SavingsVault, vault.id, {
          accruedInterest: newAccrued.toFixed(8),
        });

        const tx = this.transactionRepository.create({
          vaultId: vault.id,
          type: VaultTransactionType.INTEREST,
          amount: dailyInterest.toFixed(8),
          balanceBefore: balance.toString(),
          balanceAfter: balance.toString(),
          note: `Daily interest accrual (${(annualRate * 100).toFixed(2)}% APR)`,
        });
        await manager.save(tx);
      });

      count++;
    }

    if (count > 0) {
      this.logger.log(`Accrued interest for ${count} vaults`);
    }

    return count;
  }

  async processMaturity(): Promise<number> {
    const vaults = await this.vaultRepository.find({
      where: { status: VaultStatus.ACTIVE },
    });

    const now = new Date();
    let count = 0;

    for (const vault of vaults) {
      if (new Date(vault.unlockAt) > now) continue;

      const currentBalance = parseFloat(vault.currentBalance);
      const accruedInterest = parseFloat(vault.accruedInterest);
      const newBalance = currentBalance + accruedInterest;

      await this.dataSource.transaction(async (manager) => {
        await manager.update(SavingsVault, vault.id, {
          status: VaultStatus.MATURED,
          currentBalance: newBalance.toFixed(8),
          accruedInterest: '0',
          maturedAt: now,
        });

        const tx = this.transactionRepository.create({
          vaultId: vault.id,
          type: VaultTransactionType.INTEREST,
          amount: accruedInterest.toFixed(8),
          balanceBefore: currentBalance.toString(),
          balanceAfter: newBalance.toString(),
          note: 'Interest credited at maturity',
        });
        await manager.save(tx);
      });

      try {
        const totalFormatted = newBalance.toFixed(2);
        await this.notificationsService.create({
          userId: vault.userId,
          type: NotificationType.SYSTEM,
          title: 'Vault Matured',
          message: `Your vault "${vault.name}" has matured! Final balance: ${totalFormatted} ${vault.currency}. Withdraw your funds now.`,
          relatedId: vault.id,
          metadata: {
            vaultId: vault.id,
            vaultName: vault.name,
            currency: vault.currency,
            finalBalance: newBalance.toString(),
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to send maturity notification for vault ${vault.id}`,
          error,
        );
      }

      count++;
    }

    if (count > 0) {
      this.logger.log(`Processed maturity for ${count} vaults`);
    }

    return count;
  }

  async processAutoDeposits(): Promise<{ processed: number; skipped: number }> {
    const vaults = await this.vaultRepository.find({
      where: { status: VaultStatus.ACTIVE },
    });

    const eligible = vaults.filter(
      (v) => v.autoDepositAmount !== null && v.autoDepositFrequency !== null,
    );

    let processed = 0;
    let skipped = 0;

    for (const vault of eligible) {
      if (!(await this.isAutoDepositDue(vault))) continue;

      const user = await this.usersService.findById(vault.userId);
      if (!user) continue;

      const amount = parseFloat(vault.autoDepositAmount!);
      const userBalance = parseFloat(
        user.balances?.[vault.currency]?.toString() ?? '0',
      );

      if (userBalance < amount) {
        skipped++;

        try {
          await this.notificationsService.create({
            userId: vault.userId,
            type: NotificationType.SYSTEM,
            title: 'Auto-Deposit Skipped',
            message: `Insufficient ${vault.currency} balance for auto-deposit into vault "${vault.name}". Please fund your main wallet.`,
            relatedId: vault.id,
            metadata: {
              vaultId: vault.id,
              vaultName: vault.name,
              currency: vault.currency,
              amount: amount.toString(),
              reason: 'insufficient_balance',
            },
          });
        } catch (error) {
          this.logger.error(
            `Failed to send auto-deposit skip notification for vault ${vault.id}`,
            error,
          );
        }

        continue;
      }

      const balanceBefore = parseFloat(vault.currentBalance);
      const balanceAfter = balanceBefore + amount;

      await this.dataSource.transaction(async (manager) => {
        user.balances[vault.currency] = userBalance - amount;
        await manager.save(user);

        await manager.update(SavingsVault, vault.id, {
          currentBalance: balanceAfter.toString(),
        });

        const tx = this.transactionRepository.create({
          vaultId: vault.id,
          type: VaultTransactionType.DEPOSIT,
          amount: amount.toFixed(8),
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
          note: 'Auto-deposit',
        });
        await manager.save(tx);
      });

      processed++;
    }

    if (processed > 0 || skipped > 0) {
      this.logger.log(
        `Auto-deposits: ${processed} processed, ${skipped} skipped`,
      );
    }

    return { processed, skipped };
  }

  private async findOwnedVault(
    userId: string,
    vaultId: string,
  ): Promise<SavingsVault> {
    const vault = await this.vaultRepository.findOne({
      where: { id: vaultId, userId },
    });

    if (!vault) {
      throw new NotFoundException('Vault not found');
    }

    return vault;
  }

  private mapWithProgress(vault: SavingsVault) {
    const target = parseFloat(vault.targetAmount);
    const balance = parseFloat(vault.currentBalance);
    const progressPercent = target > 0 ? Math.min((balance / target) * 100, 100) : 0;

    return {
      ...vault,
      progressPercent: Math.round(progressPercent * 100) / 100,
    };
  }

  private async isAutoDepositDue(vault: SavingsVault): Promise<boolean> {
    const lastTx = await this.transactionRepository.findOne({
      where: {
        vaultId: vault.id,
        type: VaultTransactionType.DEPOSIT,
        note: 'Auto-deposit',
      },
      order: { createdAt: 'DESC' },
    });

    const now = new Date();
    const frequency = vault.autoDepositFrequency!;

    if (!lastTx) {
      return true;
    }

    const daysSinceLastDeposit =
      (now.getTime() - lastTx.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    switch (frequency) {
      case AutoDepositFrequency.DAILY:
        return daysSinceLastDeposit >= 1;
      case AutoDepositFrequency.WEEKLY:
        return daysSinceLastDeposit >= 7;
      case AutoDepositFrequency.MONTHLY:
        return daysSinceLastDeposit >= 30;
      default:
        return false;
    }
  }

}
