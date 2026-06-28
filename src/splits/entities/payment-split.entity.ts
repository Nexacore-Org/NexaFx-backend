import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { PaymentSplitParticipant } from './payment-split-participant.entity';

export enum SplitStatus {
  PENDING = 'PENDING',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

@Entity('payment_splits')
export class PaymentSplit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  initiatorId: string;

  @Column()
  title: string;

  @Column('decimal', { precision: 18, scale: 2 })
  totalAmount: number;

  @Column({ length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: SplitStatus, default: SplitStatus::PENDING })
  status: SplitStatus;

  @OneToMany(() => PaymentSplitParticipant, (participant) => participant.split, { cascade: true })
  participants: PaymentSplitParticipant[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}