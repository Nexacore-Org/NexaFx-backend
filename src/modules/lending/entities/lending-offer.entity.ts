import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum LendingOfferStatus {
  OPEN = 'OPEN',
  MATCHED = 'MATCHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('lending_offers')
export class LendingOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  lenderId: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'varchar', length: 10, default: 'XLM' })
  currency: string;

  @Column({ type: 'numeric', precision: 5, scale: 4 })
  annualInterestRate: string;

  @Column({ type: 'int' })
  termDays: number;

  @Column({ type: 'int', default: 0 })
  minBorrowerScore: number;

  @Column({ type: 'enum', enum: LendingOfferStatus, default: LendingOfferStatus.OPEN })
  status: LendingOfferStatus;

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
