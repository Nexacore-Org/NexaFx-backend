import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
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
import { Currency } from 'src/currencies/entities/currency.entity';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,

    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createTransaction(dto: CreateTransactionDto): Promise<Transaction> {
    const {
      userId,
      currencyId,
      amount,
      type,
      description,
      sourceAccount,
      destinationAccount,
      reference,
      status,
    } = dto;

    if (reference) {
      const exists = await this.transactionsRepository.findOne({ where: { reference } });
      if (exists) {
        throw new ConflictException(`Transaction with reference ${reference} already exists`);
      }
    }

    const currency = await this.currencyRepository.findOne({ where: { id: currencyId } });
    if (!currency) throw new NotFoundException('Currency not found');

    const feePercentage = currency.feePercentage ?? 0;
    const feeAmount = Number((amount * feePercentage).toFixed(2));
    const totalAmount = Number((amount + feeAmount).toFixed(2));

    this.logger.log(`Transaction Fee Breakdown for user ${userId} | Base: ${amount}, Fee: ${feeAmount}, Total: ${totalAmount}`);

    const transaction = this.transactionsRepository.create({
      userId,
      type,
      amount: totalAmount,
      currencyId,
      status: status || TransactionStatus.PENDING,
      reference: reference || this.generateReference(),
      description,
      sourceAccount,
      destinationAccount,
      feeAmount,
      feeCurrencyId: currencyId,
      metadata: { baseAmount: amount, feePercentage, feeAmount, totalAmount },
    });

    return this.transactionsRepository.save(transaction);
  }

  async findAll(userId: string, query?: QueryTransactionDto): Promise<Transaction[]> {
    const qb = this.transactionsRepository.createQueryBuilder('t').where('t.userId = :userId', { userId });

    if (query?.type) qb.andWhere('t.type = :type', { type: query.type });
    if (query?.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query?.currencyId) qb.andWhere('t.currencyId = :currencyId', { currencyId: query.currencyId });

    qb.orderBy('t.createdAt', 'DESC');
    return qb.getMany();
  }

  async findOne(id: string, userId: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({ where: { id } });
    if (!transaction) throw new NotFoundException(`Transaction ID ${id} not found`);
    if (transaction.userId !== userId) throw new ForbiddenException('Access denied');
    return transaction;
  }

  async findByReference(reference: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({ where: { reference } });
    if (!transaction) throw new NotFoundException(`Reference ${reference} not found`);
    return transaction;
  }

  async update(id: string, dto: UpdateTransactionDto, userId: string): Promise<Transaction> {
    const transaction = await this.findOne(id, userId);

    if (dto.reference && dto.reference !== transaction.reference) {
      const exists = await this.transactionsRepository.findOne({ where: { reference: dto.reference } });
      if (exists) throw new ConflictException(`Reference ${dto.reference} already exists`);
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
    return `${prefix}-${Date.now()}-${uuidv4().substring(0, 8)}`;
  }

  async processTransaction(
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

      this.eventEmitter.emit('wallet.updated', {
        userId,
        walletId: 'wallet-123-sample',
        asset,
        previousBalance: 100,
        newBalance: 100 + amount,
        reason: 'transaction',
        timestamp: new Date(),
      });

      return transaction;
    } catch (error) {
      this.eventEmitter.emit('transaction.failed', {
        userId,
        transactionId: 'tx-' + Date.now(),
        asset,
        amount,
        reason: error.message || 'Unknown error',
        timestamp: new Date(),
      });

      throw error;
    }
  }

  async processSwap(
    userId: string,
    fromAsset: string,
    toAsset: string,
    fromAmount: number,
  ): Promise<void> {
    try {
      const rate = await this.getExchangeRate(fromAsset, toAsset);
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

  private async getExchangeRate(from: string, to: string): Promise<number> {
    const mockRates = {
      'BTC-ETH': 15.5,
      'ETH-BTC': 0.065,
      'BTC-USDT': 30000,
      'ETH-USDT': 2000,
    };
    return mockRates[`${from}-${to}`] ?? 1;
  }
}
