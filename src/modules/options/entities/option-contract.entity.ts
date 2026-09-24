import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum OptionType {
  CALL = 'CALL',
}

export enum OptionStatus {
  ACTIVE = 'ACTIVE',
  EXERCISED = 'EXERCISED',
  EXPIRED = 'EXPIRED',
}

@Entity('option_contracts')
export class OptionContract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: OptionType, default: OptionType.CALL })
  type: OptionType;

  @Column({ type: 'varchar', length: 10, default: 'XLM' })
  underlyingCurrency: string;

  @Column({ type: 'varchar', length: 10, default: 'NGN' })
  settlementCurrency: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  strikePrice: string;

  @Column({ type: 'date' })
  expiryDate: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  contractSize: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  premium: string;

  @Column({ type: 'enum', enum: OptionStatus, default: OptionStatus.ACTIVE })
  status: OptionStatus;

  @Column({ type: 'timestamp with time zone', nullable: true })
  exercisedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
