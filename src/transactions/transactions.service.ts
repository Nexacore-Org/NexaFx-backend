/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { TransactionStatus } from './enums/transaction-status.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Currency } from 'src/currencies/entities/currency.entity';
import { HorizonService } from 'src/blockchain/services/horizon/horizon.service';
import { paginate, Pagination } from 'nestjs-typeorm-paginate';
import {
  TransactionCurrencyStats,
  TransactionsStatsDto,
} from './dto/transaction-stat.dto';
import { FilterTransactionsDto } from './dto/filter-transaction.dto';
import { FeeService } from 'src/fees/fee.service';
import { UserService } from 'src/user/providers/user.service';
import { User } from 'src/user/entities/user.entity';

// Define the interface for transaction history
export interface TransactionHistory {
  id: string;
  created_at: string;
  source_account: string;
  destination_account?: string;
  amount?: string;
  asset_type?: string;
  transaction_hash: string;
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,

    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,

    private readonly eventEmitter: EventEmitter2,
    private readonly feeService: FeeService,
    private readonly userService: UserService,

    private readonly horizonService: HorizonService,
  ) {}

  async createTransaction(dto: CreateTransactionDto): Promise<Transaction> {
    const {
      initiatorId,
      receiverId,
      currencyId,
      amount,
      type,
      description,
      sourceAccount,
      destinationAccount,
      reference,
      status,
    } = dto;

    // Validate unique reference
    if (reference) {
      const exists = await this.transactionsRepository.findOne({
        where: { reference },
      });
      if (exists)
        throw new ConflictException(`Reference ${reference} already exists`);
    }

    const user = await this.userService.findOne(initiatorId);
    const currency = await this.currencyRepository.findOne({
      where: { id: currencyId },
    });
    if (!currency) throw new NotFoundException('Currency not found');

    let receiver: User | null = null;
    if (receiverId) {
      receiver = await this.userService.findOne(receiverId);
      if (!receiver) throw new NotFoundException('Receiver not found');
    }

    const { feeAmount = 0, feePercent } = await this.feeService.calculateFee({
      transactionType: type,
      amount,
      currencyId,
    });

    const totalAmount = Number((amount + feeAmount).toFixed(2));

    const transaction = this.transactionsRepository.create({
      initiatorId: user.id,
      receiverId: receiver?.id,
      type,
      asset: currency.symbol,
      amount: totalAmount,
      currencyId,
      status: status || TransactionStatus.PENDING,
      reference: reference || this.generateReference(),
      description,
      sourceAccount,
      destinationAccount,
      feeAmount,
      feeCurrencyId: currencyId,
      metadata: {
        baseAmount: amount,
        feePercent,
        feeAmount,
        totalAmount,
        transferType: receiverId ? 'internal' : 'external',
      },
    });

    return this.transactionsRepository.save(transaction);
  }

  async findAll(
    userId: string,
    query?: QueryTransactionDto,
  ): Promise<Transaction[]> {
    const qb = this.transactionsRepository
      .createQueryBuilder('t')
      .where('t.initiatorId = :userId OR t.receiverId = :userId', { userId });

    if (query?.type) qb.andWhere('t.type = :type', { type: query.type });
    if (query?.status)
      qb.andWhere('t.status = :status', { status: query.status });
    if (query?.currencyId)
      qb.andWhere('t.currencyId = :currencyId', {
        currencyId: query.currencyId,
      });

    qb.orderBy('t.createdAt', 'DESC');
    return qb.getMany();
  }

  async getTransactionsByUser(userId: string, page: number, limit: number) {
    const [transactions, total] =
      await this.transactionsRepository.findAndCount({
        where: { initiatorId: userId }, // ✅ fixed here
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
        relations: ['user'], // optional, if you need user details in the response
      });

    return {
      data: transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getTransactions(
    dto: FilterTransactionsDto,
  ): Promise<Pagination<Transaction>> {
    const query = this.transactionsRepository.createQueryBuilder('transaction');

    if (dto.status)
      query.andWhere('transaction.status = :status', { status: dto.status });
    if (dto.dateFrom)
      query.andWhere('transaction.createdAt >= :dateFrom', {
        dateFrom: dto.dateFrom,
      });
    if (dto.dateTo)
      query.andWhere('transaction.createdAt <= :dateTo', {
        dateTo: dto.dateTo,
      });
    if (dto.currency)
      query.andWhere('transaction.currency = :currency', {
        currency: dto.currency,
      });
    if (dto.userId)
      query.andWhere('transaction.userId = :userId', { userId: dto.userId });
    if (dto.search) {
      query.andWhere(
        '(transaction.description ILIKE :search OR transaction.reference ILIKE :search)',
        {
          search: `%${dto.search}%`,
        },
      );
    }

    if (dto.sortBy) {
      query.orderBy(`transaction.${dto.sortBy}`, 'DESC'); // Consider validating sortBy input
    }

    return paginate<Transaction>(query, {
      page: dto.page,
      limit: dto.limit,
    });
  }

  async findOne(id: string, userId: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
    });
    if (!transaction)
      throw new NotFoundException(`Transaction ID ${id} not found`);
    if (transaction.initiatorId !== userId)
      throw new ForbiddenException('Access denied');
    return transaction;
  }

  async findByReference(reference: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { reference },
    });
    if (!transaction)
      throw new NotFoundException(`Reference ${reference} not found`);
    return transaction;
  }

  async update(
    id: string,
    dto: UpdateTransactionDto,
    userId: string,
  ): Promise<Transaction> {
    const transaction = await this.findOne(id, userId);

    if (dto.reference && dto.reference !== transaction.reference) {
      const exists = await this.transactionsRepository.findOne({
        where: { reference: dto.reference },
      });
      if (exists)
        throw new ConflictException(
          `Reference ${dto.reference} already exists`,
        );
    }

    if (dto.status === TransactionStatus.COMPLETED && !dto.completionDate) {
      dto.completionDate = new Date();
    }

    Object.assign(transaction, dto);
    return this.transactionsRepository.save(transaction);
  }

  async remove(id: string, userId: string): Promise<void> {
    const transaction = await this.findOne(id, userId);
    await this.transactionsRepository.remove(transaction);
  }

  generateReference(prefix = 'TXN'): string {
    const uuid = uuidv4?.() ?? NIL_UUID;
    return `${prefix}-${Date.now()}-${uuid.substring(0, 8)}`;
  }

  async processTransaction(
    initiatorId: string,
    asset: string,
    amount: number,
  ): Promise<Transaction> {
    try {
      const transaction = this.transactionsRepository.create({
        initiatorId,
        asset,
        amount,
        status: TransactionStatus.COMPLETED,
      });

      await this.transactionsRepository.save(transaction);

      this.eventEmitter.emit('wallet.updated', {
        initiatorId,
        walletId: 'wallet-123-sample',
        asset,
        previousBalance: 100,
        newBalance: 100 + amount,
        reason: 'transaction',
        timestamp: new Date(),
      });

      return transaction;
    } catch (error) {
      if (error instanceof Error) {
        this.eventEmitter.emit('transaction.failed', {
          initiatorId,
          transactionId: 'tx-' + Date.now(),
          asset,
          amount,
          reason: error.message || 'Unknown error',
          timestamp: new Date(),
        });
      }
      throw error;
    }
  }

  processSwap(
    userId: string,
    fromAsset: string,
    toAsset: string,
    fromAmount: number,
  ) {
    try {
      const rate = this.getExchangeRate(fromAsset, toAsset);
      const toAmount = fromAmount * rate;

      this.eventEmitter.emit('swap.completed', {
        userId,
        swapId: 'swap-' + Date.now(),
        fromAsset,
        toAsset,
        fromAmount,
        toAmount,
        timestamp: new Date(),
      });
    } catch (error) {
      if (error instanceof Error) {
        this.eventEmitter.emit('transaction.failed', {
          userId,
          transactionId: 'swap-' + Date.now(),
          asset: fromAsset,
          amount: fromAmount,
          reason: error.message || 'Swap failed',
          timestamp: new Date(),
        });
      }

      throw error;
    }
  }

  private getExchangeRate(from: string, to: string): number {
    const mockRates: Record<string, number> = {
      'BTC-ETH': 15.5,
      'ETH-BTC': 0.065,
      'BTC-USDT': 30000,
      'ETH-USDT': 2000,
    };
    const rate = mockRates[`${from}-${to}`];
    if (!rate) {
      throw new Error(`Exchange rate not found for pair ${from}-${to}`);
    }
    return rate;
  }

  //Get transaction history for a user
  async getTransactionHistory(
    accountId: string,
  ): Promise<TransactionHistory[]> {
    return this.horizonService.getTransactionHistory(accountId);
  }

  async getStats(): Promise<TransactionsStatsDto> {
    // Total number of transactions
    const totalTransactions = await this.transactionsRepository.count();

    // Aggregated stats per currency
    const rawCurrencyStats: {
      currency: string;
      count: string;
      totalVolume: string;
      avgValue: string;
    }[] = await this.transactionsRepository
      .createQueryBuilder('tx')
      .select('tx.currency', 'currency')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(tx.amount)', 'totalVolume')
      .addSelect('AVG(tx.amount)', 'avgValue')
      .groupBy('tx.currency')
      .getRawMany();

    const currencyStats: TransactionCurrencyStats[] = rawCurrencyStats.map(
      (stat) => ({
        currency: stat.currency,
        count: parseInt(stat.count, 10),
        totalVolume: parseFloat(stat.totalVolume),
        avgValue: parseFloat(stat.avgValue),
      }),
    );

    // Most used currencies sorted by count
    const mostUsedCurrencies = currencyStats
      .sort((a, b) => b.count - a.count)
      .map((stat) => stat.currency);

    return {
      totalTransactions,
      currencyStats,
      mostUsedCurrencies,
    };
  }

  async updateStatus(id: string, newStatus: TransactionStatus) {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Only allow transitions from PENDING → SUCCESS | FAILED
    if (transaction.status !== TransactionStatus.PENDING) {
      throw new BadRequestException(
        `Cannot change status from ${transaction.status}`,
      );
    }

    if (transaction.status === newStatus) {
      throw new BadRequestException(`Transaction is already ${newStatus}`);
    }

    transaction.status = newStatus;
    await this.transactionsRepository.save(transaction);

    return { message: `Status updated to ${newStatus}` };
  }
}
