import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { LendingOffer } from './lending-offer.entity';

export enum AgreementStatus {
  ACTIVE = 'ACTIVE',
  REPAID = 'REPAID',
  DEFAULTED = 'DEFAULTED',
}

@Entity('lending_agreements')
export class LendingAgreement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  offerId: string;

  @ManyToOne(() => LendingOffer)
  @JoinColumn({ name: 'offerId' })
  offer: LendingOffer;

  @Column({ type: 'uuid' })
  borrowerId: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  principalAmount: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  interestAmount: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  platformFee: string;

  @Column({ type: 'enum', enum: AgreementStatus, default: AgreementStatus.ACTIVE })
  status: AgreementStatus;

  @Column({ type: 'timestamp with time zone' })
  disbursedAt: Date;

  @Column({ type: 'timestamp with time zone' })
  dueDate: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
