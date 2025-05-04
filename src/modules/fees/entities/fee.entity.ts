import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
  } from 'typeorm';
  
  export enum FeeAppliesTo {
    ALL = 'All', // fallback/default
    PERSONAL = 'Personal',
    BUSINESS = 'Business',
  }
  
  export enum FeeTransactionType {
    BUY = 'Buy',
    SELL = 'Sell',
    SWAP = 'Swap',
    TRANSFER = 'Transfer',
  }
  
  @Entity('fee_rules')
  export class FeeRule {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column({ type: 'enum', enum: FeeTransactionType })
    @Index()
    transactionType: FeeTransactionType;
  
    @Column({ type: 'enum', enum: FeeAppliesTo, default: FeeAppliesTo.ALL })
    @Index()
    appliesTo: FeeAppliesTo; // user account type
  
    @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
    minTransactionAmount?: number; // volume threshold (optional)
  
    @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
    maxTransactionAmount?: number; // volume cap (optional)
  
    @Column({ type: 'decimal', precision: 5, scale: 2 })
    feePercentage: number; // e.g., 1.50 means 1.5%
  
    @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
    discountPercentage?: number; // optional discount (for promos)
  
    @Column({ nullable: true })
    description?: string;
  
    @Column({ default: true })
    isActive: boolean; // enable/disable rule
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
  }
  