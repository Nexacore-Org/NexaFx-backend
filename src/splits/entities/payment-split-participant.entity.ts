import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PaymentSplit } from './payment-split.entity';

export enum ParticipantStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  DECLINED = 'DECLINED',
  WAIVED = 'WAIVED'
}

@Entity('payment_split_participants')
export class PaymentSplitParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  splitId: string;

  @ManyToOne(() => PaymentSplit, (split) => split.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'splitId' })
  split: PaymentSplit;

  @Column({ nullable: true })
  userId: string;

  @Column()
  email: string;

  @Column('decimal', { precision: 18, scale: 2 })
  shareAmount: number;

  @Column({ type: 'enum', enum: ParticipantStatus, default: ParticipantStatus::PENDING })
  status: ParticipantStatus;

  @Column({ nullable: true })
  transactionId: string;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date;
}