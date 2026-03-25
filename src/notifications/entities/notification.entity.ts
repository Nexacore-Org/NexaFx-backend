import {
  Entity,
  Index,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { NotificationType } from '../enum/notificationType.enum';
import { DB_COLUMN_TYPES } from '../../common/database/column-types';
export { NotificationType };

export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
}

// Optimizes notification list filtering by user and read/unread status.
@Index(['userId', 'status'])
// Optimizes user notification history sorted by recency.
@Index(['userId', 'createdAt'])
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, (user) => user.notifications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: DB_COLUMN_TYPES.enum,
    enum: NotificationType,
    default: NotificationType.SYSTEM,
  })
  type: NotificationType;

  @Column()
  title: string;

  @Column('text')
  message: string;

  @Column({
    type: DB_COLUMN_TYPES.enum,
    enum: NotificationStatus,
    default: NotificationStatus.UNREAD,
  })
  status: NotificationStatus;

  @Column({ type: DB_COLUMN_TYPES.json, nullable: true })
  metadata?: Record<string, any>;

  @Column({ nullable: true })
  relatedId?: string;

  @Column({ nullable: true })
  actionUrl?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: DB_COLUMN_TYPES.timestamp, nullable: true })
  readAt?: Date;
}
