import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { TransactionStatus } from './enums/transaction-status.enum';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
  ) {}

  async create(createTransactionDto: CreateTransactionDto): Promise<Transaction> {
    // Check if reference already exists
    const existingTransaction = await this.transactionsRepository.findOne({
      where: { reference: createTransactionDto.reference }
    });

    if (existingTransaction) {
      throw new ConflictException(`Transaction with reference ${createTransactionDto.reference} already exists`);
    }

    // Set default status if not provided
    if (!createTransactionDto.status) {
      createTransactionDto.status = TransactionStatus.PENDING;
    }

    const transaction = this.transactionsRepository.create(createTransactionDto);
    return this.transactionsRepository.save(transaction);
  }

  async findAll(userId: string, queryParams?: QueryTransactionDto): Promise<Transaction[]> {
    const query = this.transactionsRepository.createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId });

    // Apply filters if provided
    if (queryParams?.type) {
      query.andWhere('transaction.type = :type', { type: queryParams.type });
    }
    
    if (queryParams?.status) {
      query.andWhere('transaction.status = :status', { status: queryParams.status });
    }
    
    if (queryParams?.currencyId) {
      query.andWhere('transaction.currencyId = :currencyId', { currencyId: queryParams.currencyId });
    }

    // Order by most recent first
    query.orderBy('transaction.createdAt', 'DESC');

    return query.getMany();
  }

  async findOne(id: string, userId: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id }
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    // Enforce user-based access control
    if (transaction.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this transaction');
    }

    return transaction;
  }

  async findByReference(reference: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { reference }
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with reference ${reference} not found`);
    }

    return transaction;
  }

  async update(id: string, updateTransactionDto: UpdateTransactionDto, userId: string): Promise<Transaction> {
    // First check if the transaction exists and belongs to the user
    const transaction = await this.findOne(id, userId);

    // If reference is being updated, check for uniqueness
    if (updateTransactionDto.reference && updateTransactionDto.reference !== transaction.reference) {
      const existingTransaction = await this.transactionsRepository.findOne({
        where: { reference: updateTransactionDto.reference }
      });

      if (existingTransaction) {
        throw new ConflictException(`Transaction with reference ${updateTransactionDto.reference} already exists`);
      }
    }

    // If updating status to COMPLETED, set completionDate if not provided
    if (updateTransactionDto.status === TransactionStatus.COMPLETED && !updateTransactionDto.completionDate) {
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
}