import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum FiatDepositStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

@Entity('fiat_deposits')
@Index(['userId'])
@Index(['reference'], { unique: true })
export class FiatDeposit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255, unique: true })
  reference: string;

  @Column({
    type: 'numeric',
    precision: 20,
    scale: 8,
  })
  amount: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({
    type: 'enum',
    enum: FiatDepositStatus,
    default: FiatDepositStatus.PENDING,
  })
  status: FiatDepositStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerReference: string | null;

  @Column({ type: 'text', nullable: true })
  paymentLink: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  walletCreditedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
