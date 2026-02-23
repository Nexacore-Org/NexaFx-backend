import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Notification } from '../notifications/entities/notification.entity';
import { KycRecord } from 'src/kyc/entities/kyc.entity';

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  TUTOR = 'TUTOR',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index()
  email: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 255 })
  @Exclude({ toPlainOnly: true })
  password: string;

  @OneToMany(() => KycRecord, (kyc) => kyc.user)
  kycRecords: KycRecord[];

  @Column({ type: 'varchar', length: 20, nullable: true, unique: true })
  @Index()
  phone: string | null;

  @Column({ type: 'varchar', length: 56 })
  @Index()
  walletPublicKey: string;

  @Column({ type: 'text' })
  @Exclude({ toPlainOnly: true })
  walletSecretKeyEncrypted: string;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  balances: Record<string, number>;

  @Column({ type: 'varchar', length: 8, unique: true })
  @Index()
  referralCode: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  referredBy: string | null;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[];
}
