import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WidgetPlacement } from '../dashboard-preferences.constants';

@Entity('dashboard_preferences')
export class DashboardPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  /**
   * Ordered dashboard widget layout. Each entry describes one widget that the
   * user has placed on their dashboard. Stored as JSON so new widget types can
   * be added without a schema migration.
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  layout: WidgetPlacement[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}