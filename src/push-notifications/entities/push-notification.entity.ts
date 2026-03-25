import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { DB_COLUMN_TYPES } from '../../common/database/column-types';

export enum PushNotificationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('push_notifications')
@Index(['status', 'createdAt'])
export class PushNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: DB_COLUMN_TYPES.enum,
    enum: PushNotificationStatus,
    default: PushNotificationStatus.ACTIVE,
  })
  status: PushNotificationStatus;

  @Column({ type: 'uuid' })
  sentBy: string;

  @Column({ type: 'integer', default: 0 })
  recipientCount: number;

  @CreateDateColumn({ type: DB_COLUMN_TYPES.timestamp })
  createdAt: Date;

  @UpdateDateColumn({ type: DB_COLUMN_TYPES.timestamp })
  updatedAt: Date;
}
