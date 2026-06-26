import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../../users/user.entity';

export enum DeviceType {
  MOBILE = 'MOBILE',
  DESKTOP = 'DESKTOP',
  TABLET = 'TABLET',
  UNKNOWN = 'UNKNOWN',
}

@Entity('user_sessions')
@Index(['userId'])
@Index(['tokenId'])
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  tokenId: string; // JWT jti claim

  @Column({ type: 'varchar', length: 255 })
  deviceName: string;

  @Column({
    type: 'enum',
    enum: DeviceType,
    default: DeviceType.UNKNOWN,
  })
  deviceType: DeviceType;

  @Column({ type: 'varchar', length: 255 })
  browser: string;

  @Column({ type: 'varchar', length: 255 })
  os: string;

  @Column({ type: 'varchar', length: 255 })
  ipAddress: string;

  @Column({ type: 'varchar', length: 255, default: 'Unknown' })
  country: string;

  @Column({ type: 'varchar', length: 255, default: 'Unknown' })
  city: string;

  @Column({ type: 'boolean', default: false })
  isTrusted: boolean;

  @Column({ type: 'timestamp with time zone' })
  lastActiveAt: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;
}
