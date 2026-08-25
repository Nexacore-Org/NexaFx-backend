import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Wallet } from './entities/wallet.entity'; // Adjust to your wallet entity path
import { Transaction } from './entities/transaction.entity'; // Adjust path

@Injectable()
export class WalletAtomicService {
  private readonly logger = new Logger(WalletAtomicService.name);

  constructor(private readonly dataSource: DataSource) {}

  async deductBalanceSafely(userId: string, currency: string, amount: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Acquire pessimistic write lock (SELECT FOR UPDATE)
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId, currency },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      // 2. Check balance sufficiency
      if (wallet.balance < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      // 3. Deduct balance
      wallet.balance -= amount;

      // 4. Critical Safety Assertion before commit
      if (wallet.balance < 0) {
        this.logger.error(`CRITICAL: Negative balance detected for wallet ${wallet.id} during concurrent execution! Rolling back.`);
        throw new InternalServerErrorException('Negative balance detected during atomic transaction');
      }

      // 5. Save updated wallet and create transaction/ledger entries within the same transaction manager
      await queryRunner.manager.save(wallet);

      // Example ledger/transaction log entry creation:
      // const tx = queryRunner.manager.create(Transaction, { userId, amount, currency, status: 'SUCCESS' });
      // await queryRunner.manager.save(tx);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}