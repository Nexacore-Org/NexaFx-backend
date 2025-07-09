import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Token } from '../../auth/entities/token.entity';
import { Notifications } from 'src/notifications/entities/notification.entity';
import { RateLock } from 'src/transactions/entities/ratelock.entity';

export enum UserRole {
  USER = 'User',
  ADMIN = 'Admin',
  AUDITOR = 'Auditor',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ nullable: true })
  dateOfBirth: Date;

  @Column({ unique: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  profilePicture: string;

  @Column({ nullable: true })
  bio: string;

  @OneToMany(() => Notifications, (notification) => notification.user)
  notification: Notifications;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ nullable: true })
  passwordResetToken: string;

  @Column({ nullable: true })
  passwordResetExpires: Date;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ nullable: true })
  lastLogin: Date;

  @OneToMany(() => Token, (token) => token.user, { cascade: true })
  tokens: Token[];

  @OneToMany(() => RateLock, (rateLock) => rateLock.user, { cascade: true })
  rateLocks: RateLock[];

  @Column({ nullable: true })
  walletAddress: string;

  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  balance: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
