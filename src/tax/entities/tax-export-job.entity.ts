import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum TaxExportJurisdiction {
  UK = 'UK',
  US = 'US',
  GENERIC = 'GENERIC',
}

export enum TaxExportStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Index(['userId', 'createdAt'])
@Entity('tax_export_jobs')
export class TaxExportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'integer' })
  year: number;

  @Column({
    type: 'enum',
    enum: TaxExportJurisdiction,
  })
  jurisdiction: TaxExportJurisdiction;

  @Column({
    type: 'enum',
    enum: TaxExportStatus,
    default: TaxExportStatus.PENDING,
  })
  status: TaxExportStatus;

  @Column({ type: 'text', nullable: true })
  csv: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
