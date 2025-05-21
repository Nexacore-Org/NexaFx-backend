import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NotificationChannel } from '../enum/notificationChannel.enum';
import { NotificationPriority } from '../enum/notificationPriority.enum';
import { NotificationCategory } from '../enum/notificationCategory.enum';
import { NotificationType } from '../enum/notificationType.enum';
import { User } from '../../user/entities/user.entity';

@Entity('notification')
export class Notifications {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' }) // Ensures userId is used for the relationship
  user: User;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationCategory,
    default: NotificationCategory.SUCCESS,
  })
  category: NotificationCategory;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: false })
  isRead: boolean;

  @Column({
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.LOW,
  })
  priority: NotificationPriority;

  @Column({ nullable: true })
  relatedEntityType?: string;

  @Column({ type: 'uuid', nullable: true })
  relatedEntityId?: string;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    default: NotificationChannel.BOTH,
  })
  channel: NotificationChannel;

  @Column({ nullable: true, type: 'timestamp' })
  expirationDate?: Date;

  @Column({ nullable: true })
  actionUrl?: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
