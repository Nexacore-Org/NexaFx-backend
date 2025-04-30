// src/notification-preferences/entities/notification-preference.entity.ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @Column({ default: true })
  notifyOnTx: boolean;

  @Column({ default: true })
  notifyOnAnnouncements: boolean;

  @Column({ default: true })
  emailEnabled: boolean;

  @Column({ default: false })
  smsEnabled: boolean;

  @Column({ default: true })
  pushEnabled: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}