import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DataRequestType {
  EXPORT = 'EXPORT',
  DELETION = 'DELETION',
}

export enum DataRequestStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
}

@Entity('data_requests')
export class DataRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({
    type: 'enum',
    enum: DataRequestType,
  })
  type: DataRequestType;

  @Column({
    type: 'enum',
    enum: DataRequestStatus,
    default: DataRequestStatus.PENDING,
  })
  status: DataRequestStatus;

  @Column({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  requestedAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  downloadUrl: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
