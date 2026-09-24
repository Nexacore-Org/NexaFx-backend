import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Dispute } from './dispute.entity';

export enum EvidenceSide {
  CLAIMANT = 'CLAIMANT',
  RESPONDENT = 'RESPONDENT',
  ADMIN = 'ADMIN',
}

// Optimizes lookups for all evidence on a dispute
@Index(['disputeId'])
@Entity('dispute_evidence')
export class DisputeEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  disputeId: string;

  @ManyToOne(() => Dispute, (d) => d.evidence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'disputeId' })
  dispute: Dispute;

  @Column({ type: 'uuid' })
  submittedById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submittedById' })
  submittedBy: User;

  @Column({ type: 'enum', enum: EvidenceSide })
  side: EvidenceSide;

  @Column({ type: 'text' })
  description: string;

  /**
   * S3 / storage keys for uploaded attachments.
   * Stored as a simple text array for portability.
   */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  attachmentKeys: string[];

  /**
   * When true, the evidence has been released by an admin and is visible
   * to both parties. Claimant-side cannot see RESPONDENT evidence until
   * this flag is set on the individual record.
   */
  @Column({ type: 'boolean', default: false })
  released: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
