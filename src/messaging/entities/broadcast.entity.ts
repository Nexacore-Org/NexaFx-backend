import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum BroadcastTargetAudience {
  ALL = 'ALL',
  KYC_APPROVED = 'KYC_APPROVED',
  UNVERIFIED = 'UNVERIFIED',
  SPECIFIC_USERS = 'SPECIFIC_USERS',
}

export enum BroadcastStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
}

@Entity('broadcasts')
export class Broadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  adminId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'adminId' })
  admin: User;

  @Column()
  subject: string;

  @Column('text')
  body: string;

  @Column({ type: 'enum', enum: BroadcastTargetAudience })
  targetAudience: BroadcastTargetAudience;

  @Column('simple-array', { nullable: true })
  targetUserIds: string[];

  @Column({ type: 'enum', enum: BroadcastStatus, default: BroadcastStatus.DRAFT })
  status: BroadcastStatus;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date;

  @Column({ default: 0 })
  recipientCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
