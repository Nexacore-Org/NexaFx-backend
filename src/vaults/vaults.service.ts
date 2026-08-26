import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThanOrEqual, Not, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SavingsVault } from './entities/savings-vault.entity';
import { VaultTransaction } from './entities/vault-transaction.entity';
import { VaultStatus } from './enum/vault-status.enum';
import { VaultTransactionType } from './enum/vault-transaction-type.enum';
import { AutoDepositFrequency } from './enum/auto-deposit-frequency.enum';
import { CreateVaultDto } from './dto/create-vault.dto';
import { VaultResponseDto } from './dto/vault-response.dto';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { User } from '../users/user.entity';

@Injectable()
export class VaultsService {
  private readonly logger = new Logger(VaultsService.name);

  constructor(
    @InjectRepository(SavingsVault)
    private readonly vaultRepository: Repository<SavingsVault>,
    @InjectRepository(VaultTransaction)
    private readonly txRepository: Repository<VaultTransaction>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async createVault(
    userId: string,
    dto: CreateVaultDto,
  ): Promise<VaultResponseDto> {
    const interestRate =
      this.configService.get<string>('VAULT_INTEREST_RATE') ?? '0.05';

    const vault = this.vaultRepository.create({
      userId,
      name: dto.name,
      currency: dto.currency,
      targetAmount: dto.targetAmount.toString(),
      unlockAt: new Date(dto.unlockAt),
      annualInterestRate: interestRate,
      autoDepositAmount: dto.autoDepositAmount?.toString() ?? null,
      autoDepositFrequency: dto.autoDepositFrequency ?? null,
    });

    const saved = await this.vaultRepository.save(vault);
    return this.mapToDto(saved, []);
  }

  async deposit(
    userId: string,
    vaultId: string,
    amount: number,
  ): Promise<VaultResponseDto> {
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

    const currentUserBalance = parseFloat(
      user.balances?.[vault.currency]?.toString() ?? '0',
    );
    if (currentUserBalance < amount) {
      throw new BadRequestException(
        `Insufficient balance in main wallet. Available: ${currentUserBalance} ${vault.currency}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const vaultRepo = manager.getRepository(SavingsVault);
      const txRepo = manager.getRepository(VaultTransaction);

      const lockedVault = await vaultRepo.findOne({
        where: { id: vaultId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedVault) {
        throw new NotFoundException('Vault not found');
      }

      const balanceBefore = parseFloat(lockedVault.currentBalance);
      const balanceAfter = balanceBefore + amount;

      lockedVault.currentBalance = balanceAfter.toString();
      await vaultRepo.save(lockedVault);

      const tx = txRepo.create({
        vaultId: lockedVault.id,
        type: VaultTransactionType.DEPOSIT,
        amount: amount.toString(),
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        note: 'Manual deposit from main wallet',
      });
      await txRepo.save(tx);

      const newBalances = { ...user.balances };
      newBalances[lockedVault.currency] = currentUserBalance - amount;
      await manager.getRepository(User).update(userId, {
        balances: newBalances,
      });

      const transactions = await txRepo.find({
        where: { vaultId: lockedVault.id },
        order: { createdAt: 'DESC' },
      });

      return this.mapToDto(lockedVault, transactions);
    });
  }

  async withdraw(userId: string, vaultId: string): Promise<VaultResponseDto> {
    const vault = await this.findOwnedVault(userId, vaultId);

    if (
      vault.status === VaultStatus.CLOSED ||
      vault.status === VaultStatus.BROKEN
    ) {
      throw new BadRequestException('Vault has already been withdrawn');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const now = new Date();
    const isEarly = now < vault.unlockAt;

    return this.dataSource.transaction(async (manager) => {
      const vaultRepo = manager.getRepository(SavingsVault);
      const txRepo = manager.getRepository(VaultTransaction);

      const lockedVault = await vaultRepo.findOne({
        where: { id: vaultId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedVault) {
        throw new NotFoundException('Vault not found');
      }

      if (
        lockedVault.status === VaultStatus.CLOSED ||
        lockedVault.status === VaultStatus.BROKEN
      ) {
        throw new BadRequestException('Vault has already been withdrawn');
      }

      const currentBalance = parseFloat(lockedVault.currentBalance);
      const accruedInterest = parseFloat(lockedVault.accruedInterest);
      let totalAmount = currentBalance + accruedInterest;

      const transactions: VaultTransaction[] = [];

      if (isEarly) {
        const penaltyPercent =
          parseFloat(lockedVault.earlyWithdrawalPenaltyPercent);
        const penaltyAmount = totalAmount * penaltyPercent;
        const netAmount = totalAmount - penaltyAmount;

        lockedVault.status = VaultStatus.BROKEN;

        const penaltyTx = txRepo.create({
          vaultId: lockedVault.id,
          type: VaultTransactionType.PENALTY,
          amount: penaltyAmount.toFixed(8),
          balanceBefore: totalAmount.toString(),
          balanceAfter: netAmount.toString(),
          note: `Early withdrawal penalty (${(penaltyPercent * 100).toFixed(1)}%)`,
        });
        await txRepo.save(penaltyTx);
        transactions.push(penaltyTx);

        const withdrawTx = txRepo.create({
          vaultId: lockedVault.id,
          type: VaultTransactionType.WITHDRAWAL,
          amount: netAmount.toFixed(8),
          balanceBefore: netAmount.toString(),
          balanceAfter: '0',
          note: 'Early withdrawal after penalty',
        });
        await txRepo.save(withdrawTx);
        transactions.push(withdrawTx);

        totalAmount = netAmount;
      } else {
        lockedVault.status = VaultStatus.CLOSED;
        lockedVault.closedAt = now;

        const withdrawTx = txRepo.create({
          vaultId: lockedVault.id,
          type: VaultTransactionType.WITHDRAWAL,
          amount: totalAmount.toFixed(8),
          balanceBefore: totalAmount.toString(),
          balanceAfter: '0',
          note: 'Matured withdrawal',
        });
        await txRepo.save(withdrawTx);
        transactions.push(withdrawTx);
      }

      lockedVault.currentBalance = '0';
      lockedVault.accruedInterest = '0';
      lockedVault.closedAt = now;
      await vaultRepo.save(lockedVault);

      const newBalances = { ...user.balances };
      const existingBalance = parseFloat(
        newBalances[lockedVault.currency]?.toString() ?? '0',
      );
      newBalances[lockedVault.currency] = existingBalance + totalAmount;
      await manager.getRepository(User).update(userId, {
        balances: newBalances,
      });

      const existingTxs = await txRepo.find({
        where: { vaultId: lockedVault.id },
        order: { createdAt: 'DESC' },
      });

      return this.mapToDto(lockedVault, existingTxs);
    });
  }

  async listVaults(userId: string): Promise<VaultResponseDto[]> {
    const vaults = await this.vaultRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return vaults.map((v) => this.mapToDto(v, []));
  }

  async getVaultDetail(
    userId: string,
    vaultId: string,
  ): Promise<VaultResponseDto> {
    const vault = await this.findOwnedVault(userId, vaultId);

    const transactions = await this.txRepository.find({
      where: { vaultId: vault.id },
      order: { createdAt: 'DESC' },
    });

    return this.mapToDto(vault, transactions);
  }

  async deleteVault(userId: string, vaultId: string): Promise<void> {
    const vault = await this.findOwnedVault(userId, vaultId);

    if (
      vault.status === VaultStatus.ACTIVE ||
      vault.status === VaultStatus.BROKEN
    ) {
      throw new UnprocessableEntityException(
        'Cannot delete a vault that is ACTIVE or BROKEN. Withdraw funds first.',
      );
    }

    await this.vaultRepository.remove(vault);
  }

  async accrueInterest(): Promise<void> {
    this.logger.log('[Cron] Starting daily interest accrual');

    const activeVaults = await this.vaultRepository.find({
      where: { status: VaultStatus.ACTIVE },
    });

    let accruedCount = 0;
    for (const vault of activeVaults) {
      try {
        const currentBalance = parseFloat(vault.currentBalance);
        if (currentBalance <= 0) continue;

        const annualRate = parseFloat(vault.annualInterestRate);
        const dailyInterest = (annualRate / 365) * currentBalance;
        const roundedInterest = parseFloat(dailyInterest.toFixed(8));

        if (roundedInterest <= 0) continue;

        vault.accruedInterest = (
          parseFloat(vault.accruedInterest) + roundedInterest
        ).toString();
        vault.lastInterestAccruedAt = new Date();
        await this.vaultRepository.save(vault);

        const tx = this.txRepository.create({
          vaultId: vault.id,
          type: VaultTransactionType.INTEREST,
          amount: roundedInterest.toString(),
          balanceBefore: parseFloat(vault.currentBalance).toString(),
          balanceAfter: parseFloat(vault.currentBalance).toString(),
          note: `Daily interest at ${(parseFloat(vault.annualInterestRate) * 100).toFixed(2)}% APR`,
        });
        await this.txRepository.save(tx);

        accruedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to accrue interest for vault ${vault.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `[Cron] Interest accrued for ${accruedCount}/${activeVaults.length} vaults`,
    );
  }

  async processMaturity(): Promise<void> {
    this.logger.log('[Cron] Checking vault maturity');

    const now = new Date();
    const maturingVaults = await this.vaultRepository.find({
      where: {
        status: VaultStatus.ACTIVE,
        unlockAt: LessThanOrEqual(now),
      },
    });

    let maturedCount = 0;
    for (const vault of maturingVaults) {
      try {
        const accruedInterest = parseFloat(vault.accruedInterest);

        vault.currentBalance = (
          parseFloat(vault.currentBalance) + accruedInterest
        ).toString();
        vault.accruedInterest = '0';
        vault.status = VaultStatus.MATURED;
        vault.maturedAt = now;
        await this.vaultRepository.save(vault);

        if (accruedInterest > 0) {
          const tx = this.txRepository.create({
            vaultId: vault.id,
            type: VaultTransactionType.INTEREST,
            amount: accruedInterest.toString(),
            balanceBefore: (
              parseFloat(vault.currentBalance) - accruedInterest
            ).toString(),
            balanceAfter: vault.currentBalance,
            note: 'Interest credited at maturity',
          });
          await this.txRepository.save(tx);
        }

        await this.notificationsService.create({
          userId: vault.userId,
          type: NotificationType.SYSTEM,
          title: 'Vault Matured',
          message: `Your savings vault "${vault.name}" has matured! Balance including interest: ${vault.currentBalance} ${vault.currency}. Withdraw your funds now.`,
          relatedId: vault.id,
          metadata: {
            vaultId: vault.id,
            vaultName: vault.name,
            finalBalance: vault.currentBalance,
            currency: vault.currency,
            type: 'VAULT_MATURED',
          },
        });

        maturedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to process maturity for vault ${vault.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `[Cron] Matured ${maturedCount}/${maturingVaults.length} vaults`,
    );
  }

  async processAutoDeposits(): Promise<void> {
    this.logger.log('[Cron] Processing auto-deposits');

    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const dayOfMonth = now.getUTCDate();

    const autoDepositVaults = await this.vaultRepository.find({
      where: {
        status: VaultStatus.ACTIVE,
        autoDepositAmount: Not(IsNull()),
        autoDepositFrequency: Not(IsNull()),
      },
    });

    const filteredVaults = autoDepositVaults.filter((v) => {
      if (v.autoDepositFrequency === AutoDepositFrequency.DAILY) return true;
      if (v.autoDepositFrequency === AutoDepositFrequency.WEEKLY)
        return dayOfWeek === 1;
      if (v.autoDepositFrequency === AutoDepositFrequency.MONTHLY)
        return dayOfMonth === 1;
      return false;
    });

    let processedCount = 0;
    for (const vault of filteredVaults) {
      try {
        if (!vault.autoDepositAmount) continue;
        const amount = parseFloat(vault.autoDepositAmount);

        const user = await this.usersService.findById(vault.userId);
        if (!user) continue;

        const currentBalance = parseFloat(
          user.balances?.[vault.currency]?.toString() ?? '0',
        );

        if (currentBalance < amount) {
          await this.notificationsService.create({
            userId: vault.userId,
            type: NotificationType.SYSTEM,
            title: 'Auto-Deposit Skipped',
            message: `Auto-deposit of ${amount} ${vault.currency} into vault "${vault.name}" was skipped due to insufficient main wallet balance.`,
            relatedId: vault.id,
            metadata: {
              vaultId: vault.id,
              vaultName: vault.name,
              amount: amount.toString(),
              currency: vault.currency,
              reason: 'insufficient_balance',
              type: 'AUTO_DEPOSIT_SKIPPED',
            },
          });
          continue;
        }

        await this.dataSource.transaction(async (manager) => {
          const vaultRepo = manager.getRepository(SavingsVault);
          const txRepo = manager.getRepository(VaultTransaction);

          const lockedVault = await vaultRepo.findOne({
            where: { id: vault.id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!lockedVault) return;

          const balBefore = parseFloat(lockedVault.currentBalance);
          const balAfter = balBefore + amount;
          lockedVault.currentBalance = balAfter.toString();
          await vaultRepo.save(lockedVault);

          const tx = txRepo.create({
            vaultId: lockedVault.id,
            type: VaultTransactionType.DEPOSIT,
            amount: amount.toString(),
            balanceBefore: balBefore.toString(),
            balanceAfter: balAfter.toString(),
            note: `Auto-deposit (${vault.autoDepositFrequency})`,
          });
          await txRepo.save(tx);

          const newBalances = { ...user.balances };
          newBalances[lockedVault.currency] = currentBalance - amount;
          await manager.getRepository(User).update(lockedVault.userId, {
            balances: newBalances,
          });
        });

        processedCount++;
      } catch (error) {
        this.logger.error(
          `Auto-deposit failed for vault ${vault.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `[Cron] Processed auto-deposits for ${processedCount}/${filteredVaults.length} vaults`,
    );
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

  private mapToDto(
    vault: SavingsVault,
    transactions: VaultTransaction[],
  ): VaultResponseDto {
    const targetAmount = parseFloat(vault.targetAmount);
    const currentBalance = parseFloat(vault.currentBalance);
    const progressPercent =
      targetAmount > 0
        ? Math.min(100, (currentBalance / targetAmount) * 100)
        : 0;

    return {
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
      progressPercent: parseFloat(progressPercent.toFixed(2)),
      maturedAt: vault.maturedAt,
      closedAt: vault.closedAt,
      createdAt: vault.createdAt,
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        note: tx.note,
        createdAt: tx.createdAt,
      })),
    };
  }
}
