import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum AnnouncementType {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  MAINTENANCE = 'MAINTENANCE',
}

export enum AnnouncementAudience {
  ALL = 'ALL',
  KYC_APPROVED = 'KYC_APPROVED',
  ADMINS = 'ADMINS',
}

@Entity('announcements')
export class Announcement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: AnnouncementType, default: AnnouncementType.INFO })
  type: AnnouncementType;

  @Column({ type: 'timestamp with time zone' })
  startsAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  endsAt: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  requiresAcknowledgment: boolean;

  @Column({
    type: 'enum',
    enum: AnnouncementAudience,
    default: AnnouncementAudience.ALL,
  })
  targetAudience: AnnouncementAudience;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
