export class TransactionTagging {}
import { Entity, Column, PrimaryGeneratedColumn, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';

@Entity()
export class TransactionTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  color: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ default: false })
  isGlobal: boolean;

  @ManyToMany(() => Transaction, transaction => transaction.tags)
  @JoinTable({
    name: 'transaction_tag_mapping',
    joinColumn: {
      name: 'tagId',
      referencedColumnName: 'id'
    },
    inverseJoinColumn: {
      name: 'transactionId',
      referencedColumnName: 'id'
    }
  })
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}