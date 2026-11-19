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
@Index('IDX_votes_proposalId_voterId', ['proposalId', 'voterId'], {
  unique: true,
})
export class Vote {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_votes_id' })
  id: string;

  @Column({ type: 'uuid' })
  @Index('IDX_votes_proposalId')
  proposalId: string;

  @ManyToOne(() => Proposal, (proposal) => proposal.votes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'proposalId',
    foreignKeyConstraintName: 'FK_votes_proposalId',
  })
  proposal: Proposal;

  @Column({ type: 'uuid' })
  @Index('IDX_votes_voterId')
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
