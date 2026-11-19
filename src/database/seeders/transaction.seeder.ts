import { DataSource } from 'typeorm';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../transactions/entities/transaction.entity';
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

export async function seedTransactions(dataSource: DataSource) {
  const transactionRepository = dataSource.getRepository(Transaction);
  const statuses = [
    TransactionStatus.SUCCESS,
    TransactionStatus.FAILED,
    TransactionStatus.PENDING,
  ];
  const transactions = Array.from({ length: 100 }, (_, i) => ({
    id: uuidv5(`txn${i}`, NAMESPACE),
    userId: uuidv5(`user${(i % 5) + 1}`, NAMESPACE),
    type: TransactionType.DEPOSIT,
    amount: (Math.floor(Math.random() * 1000) + 100).toFixed(8),
    currency: 'USD',
    status: statuses[i % statuses.length],
    createdAt: new Date(Date.now() - i * 60000),
    updatedAt: new Date(Date.now() - i * 60000),
  }));
  await transactionRepository.upsert(transactions, ['id']);
}
