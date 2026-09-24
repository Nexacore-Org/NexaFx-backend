import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum FaucetRequestStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('faucet_requests')
@Index(['stellarPublicKey', 'createdAt'])
export class FaucetRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  requestedBy: string | null;

  @Column({ type: 'varchar', length: 56 })
  stellarPublicKey: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  amountXlm: string;

  @Column({
    type: 'enum',
    enum: FaucetRequestStatus,
    default: FaucetRequestStatus.PROCESSING,
  })
  status: FaucetRequestStatus;

  @Column({ type: 'varchar', length: 128, nullable: true })
  txHash: string | null;

  @Column({ type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ type: 'uuid', nullable: true })
  apiKeyId: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
