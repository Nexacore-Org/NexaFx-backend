import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { TransactionStatus } from './enums/transaction-status.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    createTransactionDto: CreateTransactionDto,
  ): Promise<Transaction> {
    // Check if reference already exists
    const existingTransaction = await this.transactionsRepository.findOne({
      where: { reference: createTransactionDto.reference },
    });

    if (existingTransaction) {
      throw new ConflictException(
        `Transaction with reference ${createTransactionDto.reference} already exists`,
      );
    }

    // Set default status if not provided
    if (!createTransactionDto.status) {
      createTransactionDto.status = TransactionStatus.PENDING;
    }

    const transaction =
      this.transactionsRepository.create(createTransactionDto);
    return this.transactionsRepository.save(transaction);
  }

  async findAll(
    userId: string,
    queryParams?: QueryTransactionDto,
  ): Promise<Transaction[]> {
    const query = this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId });

    // Apply filters if provided
    if (queryParams?.type) {
      query.andWhere('transaction.type = :type', { type: queryParams.type });
    }

    if (queryParams?.status) {
      query.andWhere('transaction.status = :status', {
        status: queryParams.status,
      });
    }

    if (queryParams?.currencyId) {
      query.andWhere('transaction.currencyId = :currencyId', {
        currencyId: queryParams.currencyId,
      });
    }

    // Order by most recent first
    query.orderBy('transaction.createdAt', 'DESC');

    return query.getMany();
  }

  async findOne(id: string, userId: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    // Enforce user-based access control
    if (transaction.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this transaction',
      );
    }

    return transaction;
  }

  async findByReference(reference: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { reference },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with reference ${reference} not found`,
      );
    }

    return transaction;
  }

  async update(
    id: string,
    updateTransactionDto: UpdateTransactionDto,
    userId: string,
  ): Promise<Transaction> {
    // First check if the transaction exists and belongs to the user
    const transaction = await this.findOne(id, userId);

    // If reference is being updated, check for uniqueness
    if (
      updateTransactionDto.reference &&
      updateTransactionDto.reference !== transaction.reference
    ) {
      const existingTransaction = await this.transactionsRepository.findOne({
        where: { reference: updateTransactionDto.reference },
      });

      if (existingTransaction) {
        throw new ConflictException(
          `Transaction with reference ${updateTransactionDto.reference} already exists`,
        );
      }
    }

    // If updating status to COMPLETED, set completionDate if not provided
    if (
      updateTransactionDto.status === TransactionStatus.COMPLETED &&
      !updateTransactionDto.completionDate
    ) {
      updateTransactionDto.completionDate = new Date();
    }

    // Merge changes and save
    Object.assign(transaction, updateTransactionDto);
    return this.transactionsRepository.save(transaction);
  }

  async remove(id: string, userId: string): Promise<void> {
    const transaction = await this.findOne(id, userId);
    await this.transactionsRepository.remove(transaction);
  }

  async generateUniqueReference(prefix = 'TXN'): Promise<string> {
    // Generate a unique reference with format PREFIX-TIMESTAMP-RANDOM
    const timestamp = Date.now().toString();
    const random = uuidv4().substring(0, 8);
    return `${prefix}-${timestamp}-${random}`;
  }

  // Method for processing a transaction
  async processTransactionion(
    userId: string,
    asset: string,
    amount: number,
  ): Promise<Transaction> {
    try {
      const transaction = this.transactionsRepository.create({
        userId,
        asset,
        amount,
        status: TransactionStatus.COMPLETED,
      });

      await this.transactionsRepository.save(transaction);

      // Emit wallet.updated event
      this.eventEmitter.emit('wallet.updated', {
        userId,
        walletId: 'wallet-123-sample',
        asset,
        previousBalance: 100, // Example value
        newBalance: 100 + amount,
        reason: 'transaction',
        timestamp: new Date(),
      });

      return transaction;
    } catch (error) {
      // If transaction fails, emit transaction.failed event
      this.eventEmitter.emit('transaction.failed', {
        userId,
        transactionId: 'tx-sample-transaction-id' + Date.now(),
        asset,
        amount,
        reason: error.message || 'Unknown error',
        timestamp: new Date(),
      });

      throw error;
    }
  }

  // Method for processing a swap
  async processSwap(
    userId: string,
    fromAsset: string,
    toAsset: string,
    fromAmount: number,
  ): Promise<void> {
    try {
      // Your swap processing logic here
      const exchangeRate = await this.getExchangeRate(fromAsset, toAsset);
      const toAmount = fromAmount * exchangeRate;

      // After successful swap
      this.eventEmitter.emit('swap.completed', {
        userId,
        swapId: 'swap-' + Date.now(), // In a real app, you'd have a real swap ID
        fromAsset,
        toAsset,
        fromAmount,
        toAmount,
        timestamp: new Date(),
      });
    } catch (error) {
      // If swap fails, emit transaction.failed event
      this.eventEmitter.emit('transaction.failed', {
        userId,
        transactionId: 'swap-' + Date.now(),
        asset: fromAsset,
        amount: fromAmount,
        reason: error.message || 'Swap failed',
        timestamp: new Date(),
      });

      throw error;
    }
  }

  // Mock method to get exchange rate
  private async getExchangeRate(
    fromAsset: string,
    toAsset: string,
  ): Promise<number> {
    // Add external api service to get exchange rate here
    const rates = {
      'BTC-ETH': 15.5,
      'ETH-BTC': 0.065,
      'BTC-USDT': 30000,
      'ETH-USDT': 2000,
    };

    return rates[`${fromAsset}-${toAsset}`] || 1;
  }
}
