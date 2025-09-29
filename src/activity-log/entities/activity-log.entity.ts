import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('activity_logs')
@Index(['userId', 'isActive'])
@Index(['ipAddress'])
@Index(['loggedInAt'])
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ type: 'text' })
  userAgent: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  deviceType: string; // Mobile, Desktop, Tablet

  @Column({ type: 'varchar', length: 100, nullable: true })
  browser: string; // Chrome, Firefox, Safari, etc.

  @Column({ type: 'varchar', length: 100, nullable: true })
  operatingSystem: string; // Windows, macOS, iOS, Android

  @Column({ type: 'varchar', length: 100, nullable: true })
  location: string; // City, Country (if available)

  @Column({ type: 'varchar', length: 255, nullable: true })
  sessionToken: string; // JWT token ID or session identifier

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  loggedInAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  loggedOutAt: Date;

  @Column({ type: 'boolean', default: true })
  @Index()
  isActive: boolean;

  @Column({ type: 'varchar', length: 50, default: 'LOGIN' })
  activityType: string; // LOGIN, LOGOUT, TOKEN_REFRESH, SUSPICIOUS_ACTIVITY

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>; // Additional data like login method, 2FA status

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
