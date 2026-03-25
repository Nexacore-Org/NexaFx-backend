import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum EvidencePackageStatus {
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

@Index(['requestedByUserId', 'status'])
@Entity('evidence_packages')
export class EvidencePackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  requestedByUserId: string;

  @Column({
    type: 'enum',
    enum: EvidencePackageStatus,
    default: EvidencePackageStatus.PROCESSING,
  })
  status: EvidencePackageStatus;

  @Column({ type: 'timestamp', nullable: true })
  generatedAt: Date | null;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'int', default: 0 })
  documentCount: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  manifestHash: string | null;

  @Column({ type: 'jsonb', nullable: true })
  manifestJson: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  manifestSignature: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  signatureAlgorithm: string | null;

  @Column({ type: 'jsonb', nullable: true })
  chainOfCustody: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  packageDataBase64: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
