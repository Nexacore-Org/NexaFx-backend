import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * Lifecycle status of a database snapshot taken before a migration run.
 */
export enum SnapshotStatus {
  /** Snapshot created, migration not yet applied. */
  PENDING = 'PENDING',
  /** Migration applied successfully; snapshot available for rollback. */
  APPLIED = 'APPLIED',
  /** Migration was reverted and snapshot was used for restoration. */
  ROLLED_BACK = 'ROLLED_BACK',
}

/**
 * Records metadata for every pg_dump snapshot taken before a migration run.
 *
 * Table: migration_snapshots
 */
@Entity('migration_snapshots')
export class MigrationSnapshot {
  /** UUID primary key */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Target environment where the snapshot was taken.
   * e.g. "staging" | "production"
   */
  @Column({ type: 'varchar', length: 50 })
  environment: string;

  /**
   * S3 object key for the pg_dump file.
   * Format: nexafx/pre-migration/<environment>/<timestamp>-<migrationCount>.dump
   */
  @Column({ type: 'varchar', length: 500 })
  snapshotKey: string;

  /** Number of pending migrations that were applied in this run. */
  @Column({ type: 'int' })
  migrationCount: number;

  /**
   * Current lifecycle status of this snapshot.
   */
  @Column({
    type: 'enum',
    enum: SnapshotStatus,
    default: SnapshotStatus.PENDING,
  })
  status: SnapshotStatus;

  /**
   * Timestamp when the migration run completed successfully.
   * Null until migrations are applied.
   */
  @Column({ type: 'timestamptz', nullable: true })
  appliedAt: Date | null;

  /**
   * Timestamp when this snapshot was used to roll back a migration.
   * Null unless a rollback was performed.
   */
  @Column({ type: 'timestamptz', nullable: true })
  rolledBackAt: Date | null;

  /** Timestamp when this record was created (snapshot taken). */
  @CreateDateColumn({ type: 'timestamptz' })
  takenAt: Date;
}
