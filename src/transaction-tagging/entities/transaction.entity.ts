import { Entity, Column, PrimaryGeneratedColumn, ManyToMany } from 'typeorm';
import { TransactionTag } from '../../transaction-tags/entities/transaction-tag.entity';

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Existing columns...

  @ManyToMany(() => TransactionTag, tag => tag.transactions)
  tags: TransactionTag[];

  // Other existing fields...
}
