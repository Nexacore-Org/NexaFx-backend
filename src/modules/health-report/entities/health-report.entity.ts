import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('health_reports')
export class HealthReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  reportDate: string;

  @Column({ type: 'jsonb', default: '{}' })
  metrics: {
    api: {
      p50Latency: number;
      p95Latency: number;
      p99Latency: number;
      errorRate: number;
      totalRequests: number;
      requestChangePct: number;
    };
    queues: {
      failedJobCount: Record<string, number>;
      avgProcessingTime: Record<string, number>;
      backlogSize: number;
    };
    database: {
      connectionPoolMax: number;
      connectionPoolCurrent: number;
      slowestQueries: Array<{ query: string; avgTime: number }>;
      topTableSizes: Array<{ table: string; size: string }>;
      replicationLag: number | null;
    };
    security: {
      failedLogins7d: number;
    };
  };

  @Column({ type: 'jsonb', default: '[]' })
  anomalies: string[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
