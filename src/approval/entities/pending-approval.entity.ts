import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export interface ApproverSignature {
  approverId: string;
  approvedAt: Date;
  comment?: string;
}

@Entity('pending_approvals')
export class PendingApproval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  transactionId: string;

  @Column()
  policyId: string;

  @Column()
  initiatorId: string;

  @Column()
  @Index()
  organisationId: string;

  @Column({ type: 'jsonb', default: [] })
  approvals: ApproverSignature[];

  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.PENDING })
  status: ApprovalStatus;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}