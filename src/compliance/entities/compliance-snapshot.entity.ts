import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('compliance_metrics_snapshots')
export class ComplianceMetricsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('jsonb')
  aml_metrics: { openFlags: number; flagsLast24h: number; sarsFiled: number };

  @Column('jsonb')
  kyc_metrics: { pendingReview: number; approvedToday: number; expiringSoon: number };

  @Column('jsonb')
  fraud_metrics: { riskAlertsOpen: number; blockedIps: number };

  @Column('jsonb')
  sanctions_metrics: { pendingScreenings: number; matches: number };

  @Column('jsonb')
  transaction_metrics: { volumeUsd24h: number; count24h: number; largeCount: number };

  @Column('jsonb')
  system_metrics: { activeUsers: number; queueBacklog: number };

  @CreateDateColumn({ type: 'timestamptz' })
  snapshotDate: Date;
}