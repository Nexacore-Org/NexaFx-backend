import { DataSource } from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

export async function seedTransactions(dataSource: DataSource) {
    const transactionRepository = dataSource.getRepository(Transaction);
    const statuses = ['PENDING', 'COMPLETED', 'FAILED'];
    const transactions = Array.from({ length: 100 }, (_, i) => ({
        id: uuidv5(`txn${i}`, NAMESPACE),
        amount: Math.floor(Math.random() * 1000) + 100,
        status: statuses[i % statuses.length],
        createdAt: new Date(Date.now() - i * 60000),
        updatedAt: new Date(Date.now() - i * 60000),
        userId: uuidv5(`user${(i % 5) + 1}`, NAMESPACE),
        fromCurrency: 'USD',
        toCurrency: 'NGN',
    }));
    await transactionRepository.upsert(transactions, ['id']);
}
