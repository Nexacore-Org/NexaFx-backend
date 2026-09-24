import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum SignalType {
  MULTI_ACCOUNT = 'MULTI_ACCOUNT',
  REFERRAL_FARMING = 'REFERRAL_FARMING',
  PROBE_PATTERN = 'PROBE_PATTERN',
}

@Entity('abuse_signals')
@Index(['userId', 'signalType'])
export class AbuseSignal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: SignalType,
  })
  signalType: SignalType;

  @Column('float')
  score: number;

  @Column({ type: 'jsonb', nullable: true })
  evidence: Record<string, any>;

  @Column({ default: false })
  resolved: boolean;

  @CreateDateColumn()
  detectedAt: Date;
}