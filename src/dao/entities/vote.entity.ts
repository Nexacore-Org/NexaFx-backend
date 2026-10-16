import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Proposal } from './proposal.entity';

export enum VoteChoice {
  YES = 'YES',
  NO = 'NO',
  ABSTAIN = 'ABSTAIN',
}

@Entity('votes')
@Index(['proposalId', 'voterId'], { unique: true })
export class Vote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  proposalId: string;

  @ManyToOne(() => Proposal, (proposal) => proposal.votes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'proposalId' })
  proposal: Proposal;

  @Column({ type: 'uuid' })
  @Index()
  voterId: string;

  @Column({
    type: 'enum',
    enum: VoteChoice,
  })
  choice: VoteChoice;

  /** XLM balance weight at votingStartAt (snapshot, not live) */
  @Column({ type: 'decimal', precision: 20, scale: 8 })
  weight: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  castAt: Date;
}

/**
 * Per-proposal balance snapshot captured at votingStartAt.
 *
 * Vote weight is derived from this snapshot rather than the voter's live
 * XLM balance so that funds cannot be recycled across accounts to vote
 * multiple times with the same XLM.
 */
@Entity('proposal_balance_snapshots')
@Index(['proposalId', 'voterId'], { unique: true })
export class ProposalBalanceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  proposalId: string;

  @ManyToOne(() => Proposal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proposalId' })
  proposal: Proposal;

  @Column({ type: 'uuid' })
  @Index()
  voterId: string;

  /** XLM balance weight captured at votingStartAt (snapshot, not live) */
  @Column({ type: 'decimal', precision: 20, scale: 8 })
  weight: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  capturedAt: Date;
}
