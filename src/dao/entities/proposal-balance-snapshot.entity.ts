import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Per-proposal balance snapshot captured at votingStartAt.
 *
 * Vote weight must reflect the voter's XLM balance at the moment voting opens
 * (a snapshot), not the live balance at cast time. Otherwise a voter could
 * recycle the same XLM across accounts and vote repeatedly with the same funds.
 *
 * Rows are populated lazily on the first vote for a proposal (or by the
 * finalize cron) and are keyed by (proposalId, voterId).
 */
@Entity('proposal_balance_snapshots')
@Unique('UQ_proposal_balance_snapshots_proposal_voter', ['proposalId', 'voterId'])
@Index('IDX_proposal_balance_snapshots_proposal', ['proposalId'])
export class ProposalBalanceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  proposalId: string;

  @Column({ type: 'uuid' })
  voterId: string;

  /** XLM balance weight captured at votingStartAt (snapshot, not live). */
  @Column({ type: 'numeric', precision: 30, scale: 8, default: 0 })
  weight: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
