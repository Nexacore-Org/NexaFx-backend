import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('announcement_acknowledgments')
@Index(['userId', 'announcementId'], { unique: true })
export class AnnouncementAcknowledgment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  announcementId: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  acknowledgedAt: Date;
}
