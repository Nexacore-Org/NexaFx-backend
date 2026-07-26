import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum KycTierRequired {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  ENHANCED = 'ENHANCED',
}

@Entity('payment_corridors')
export class PaymentCorridor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  sourceCurrency: string;

  @Column({ type: 'varchar', length: 10 })
  destinationCurrency: string;

  @Column({ type: 'varchar', length: 2 })
  sourceCountry: string;

  @Column({ type: 'varchar', length: 2 })
  destinationCountry: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  minAmount: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  maxAmount: string;

  @Column({ type: 'int' })
  estimatedMinutes: number;

  @Column({ type: 'simple-array', nullable: true })
  deliveryMethods: string[];

  @Column({ type: 'text', nullable: true })
  complianceNotes: string;

  @Column({ type: 'numeric', precision: 5, scale: 4 })
  feePercent: string;

  @Column({ type: 'enum', enum: KycTierRequired, default: KycTierRequired.BASIC })
  requiredKycTier: KycTierRequired;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
