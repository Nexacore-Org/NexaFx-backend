import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('transaction_signing_keys')
export class TransactionSigningKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  keyName: string;

  @Column({ type: 'varchar', length: 255 })
  totpSecret: string; // AES-256-GCM encrypted

  @Column({ type: 'boolean', default: false })
  isActive: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  activatedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'numeric', precision: 20, scale: 8, default: '0' })
  minAmountUsd: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
