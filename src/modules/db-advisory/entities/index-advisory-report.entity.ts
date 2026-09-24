import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export interface MissingIndex {
  tableName: string;
  seqScanCount: number;
  idxScanCount: number;
  tableSize: string;
  suggestedIndex: string;
}

export interface UnusedIndex {
  tableName: string;
  indexName: string;
  indexSize: string;
  scanCount: number;
  suggestedDrop: string;
}

export interface SlowQuery {
  query: string;
  meanExecTimeMs: number;
  calls: number;
  totalExecTimeMs: number;
}

@Entity('index_advisory_reports')
export class IndexAdvisoryReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp with time zone' })
  runAt: Date;

  @Column({ type: 'jsonb', default: '[]' })
  missingIndexes: MissingIndex[];

  @Column({ type: 'jsonb', default: '[]' })
  unusedIndexes: UnusedIndex[];

  @Column({ type: 'jsonb', default: '[]' })
  slowQueries: SlowQuery[];

  @Column({ type: 'jsonb', default: '[]' })
  suggestedMigrations: string[];

  @Column({ type: 'boolean', default: false })
  hasCriticalFindings: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
