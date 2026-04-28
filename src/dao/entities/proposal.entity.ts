import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Vote } from './vote.entity';

export enum ProposalStatus {
  ACTIVE = 'ACTIVE',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity('proposals')
@Index(['status'])
@Index(['proposerId'])
@Index(['votingEndAt'])
export class Proposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'uuid' })
  @Index()
  proposerId: string;

  @Column({
    type: 'enum',
    enum: ProposalStatus,
    default: ProposalStatus.ACTIVE,
  })
  @Index()
  status: ProposalStatus;

  @Column({ type: 'timestamp with time zone' })
  votingStartAt: Date;

  @Column({ type: 'timestamp with time zone' })
  votingEndAt: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  quorumPercent: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  passThresholdPercent: number;

  @OneToMany(() => Vote, (vote) => vote.proposal)
  votes: Vote[];

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  finalYesWeight: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  finalNoWeight: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  finalAbstainWeight: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  totalVotingWeight: number | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  @Index()
  onChainTxHash: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
