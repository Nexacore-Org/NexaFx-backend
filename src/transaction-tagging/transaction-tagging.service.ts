// src/transaction-tags/transaction-tags.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionTag } from './entities/transaction-tag.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CreateTransactionTagDto } from './dto/create-transaction-tag.dto';
import { UpdateTransactionTagDto } from './dto/update-transaction-tag.dto';
import { AssignTagDto } from './dto/assign-tag.dto';
import { Role } from '../users/enums/role.enum';

@Injectable()
export class TransactionTagsService {
  constructor(
    @InjectRepository(TransactionTag)
    private transactionTagRepository: Repository<TransactionTag>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}

  async create(userId: string, createTransactionTagDto: CreateTransactionTagDto, roles: string[]): Promise<TransactionTag> {
    // Only admins can create global tags
    if (createTransactionTagDto.isGlobal && !roles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Only administrators can create global tags');
    }

    const tag = this.transactionTagRepository.create({
      ...createTransactionTagDto,
      userId: createTransactionTagDto.isGlobal ? null : userId,
    });

    return this.transactionTagRepository.save(tag);
  }

  async findAll(userId: string, roles: string[]): Promise<TransactionTag[]> {
    const isAdmin = roles.includes(Role.ADMIN);
    
    // Admins can see all tags, users can see their own tags and global tags
    const queryBuilder = this.transactionTagRepository.createQueryBuilder('tag');
    
    if (!isAdmin) {
      queryBuilder.where('tag.isGlobal = :isGlobal OR tag.userId = :userId', {
        isGlobal: true,
        userId,
      });
    }
    
    return queryBuilder.orderBy('tag.name', 'ASC').getMany();
  }

  async findOne(id: string, userId: string, roles: string[]): Promise<TransactionTag> {
    const tag = await this.transactionTagRepository.findOne({ where: { id } });
    
    if (!tag) {
      throw new NotFoundException(`Tag with ID "${id}" not found`);
    }
    
    const isAdmin = roles.includes(Role.ADMIN);
    
    // Check if user has access to this tag
    if (!isAdmin && !tag.isGlobal && tag.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this tag');
    }
    
    return tag;
  }

  async update(id: string, updateTransactionTagDto: UpdateTransactionTagDto, userId: string, roles: string[]): Promise<TransactionTag> {
    const tag = await this.findOne(id, userId, roles);
    const isAdmin = roles.includes(Role.ADMIN);
    
    // Check if user has permission to update this tag
    if (!isAdmin && (!tag.userId || tag.userId !== userId)) {
      throw new ForbiddenException('You do not have permission to update this tag');
    }
    
    // Only admins can update global status
    if (updateTransactionTagDto.isGlobal !== undefined && !isAdmin) {
      throw new ForbiddenException('Only administrators can change the global status of tags');
    }
    
    // Update the tag
    const updatedTag = { ...tag, ...updateTransactionTagDto };
    return this.transactionTagRepository.save(updatedTag);
  }

  async remove(id: string, userId: string, roles: string[]): Promise<void> {
    const tag = await this.findOne(id, userId, roles);
    const isAdmin = roles.includes(Role.ADMIN);
    
    // Check if user has permission to delete this tag
    if (!isAdmin && (!tag.userId || tag.userId !== userId)) {
      throw new ForbiddenException('You do not have permission to delete this tag');
    }
    
    // Only admins can delete global tags
    if (tag.isGlobal && !isAdmin) {
      throw new ForbiddenException('Only administrators can delete global tags');
    }
    
    await this.transactionTagRepository.remove(tag);
  }

  async assignTagsToTransaction(transactionId: string, assignTagDto: AssignTagDto, userId: string, roles: string[]): Promise<Transaction> {
    // Find the transaction
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
      relations: ['tags'],
    });
    
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID "${transactionId}" not found`);
    }
    
    // Check if user owns this transaction
    if (transaction.userId !== userId && !roles.includes(Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to modify this transaction');
    }

    // Find all tags by their IDs
    const tags = await this.transactionTagRepository.findByIds(assignTagDto.tagIds);
    
    // Check if all provided tag IDs exist
    if (tags.length !== assignTagDto.tagIds.length) {
      throw new NotFoundException('One or more tags were not found');
    }
    
    // Check if user has access to all these tags
    const isAdmin = roles.includes(Role.ADMIN);
    for (const tag of tags) {
      if (!isAdmin && !tag.isGlobal && tag.userId !== userId) {
        throw new ForbiddenException(`You do not have permission to use tag "${tag.name}"`);
      }
    }
    
    // Assign tags to transaction
    transaction.tags = tags;
    return this.transactionRepository.save(transaction);
  }

  async getTransactionTags(transactionId: string, userId: string, roles: string[]): Promise<TransactionTag[]> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
      relations: ['tags'],
    });
    
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID "${transactionId}" not found`);
    }
    
    // Check if user owns this transaction
    if (transaction.userId !== userId && !roles.includes(Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to view this transaction');
    }
    
    return transaction.tags;
  }
}