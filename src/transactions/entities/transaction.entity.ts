import { 
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Index 
  } from 'typeorm';
  import { IsEnum } from 'class-validator';
import { TransactionType } from '../enum/transaction.enum';
import { TransactionStatus } from '../enum/transactionStatus.enum';
  
  
  @Entity()
  export class Transaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    // @ManyToOne(() => User, (user) => user.transactions, { nullable: false, eager: true })
    // @Index()
    // user: User;
  
    @Column({ type: 'enum', enum: TransactionType })
    @IsEnum(TransactionType)
    @Index()
    type: TransactionType;
  
    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount: number;
  
    // @ManyToOne(() => Currency, { nullable: false, eager: true })
    // @Index()
    // currency: Currency;
  
    @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
    @IsEnum(TransactionStatus)
    @Index()
    status: TransactionStatus;
  
    @Column({ unique: true })
    reference: string;
  
    @Column({ nullable: true })
    description?: string;
  
    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, any>;
  
    @Column({ nullable: true })
    sourceAccount?: string;
  
    @Column({ nullable: true })
    destinationAccount?: string;
  
    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    feeAmount?: number;
  
    // @ManyToOne(() => Currency, { nullable: true, eager: true })
    // feeCurrency?: Currency;
  
    @Column({ type: 'timestamp', nullable: true })
    processingDate?: Date;
  
    @Column({ type: 'timestamp', nullable: true })
    completionDate?: Date;
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
  }
  