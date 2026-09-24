import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../../users/user.entity';

export enum ModerationAction {
  ALLOWED = 'ALLOWED',
  STRIPPED = 'STRIPPED',
  REJECTED = 'REJECTED',
  FLAGGED_FOR_REVIEW = 'FLAGGED_FOR_REVIEW',
}

@Entity('content_moderation_events')
export class ContentModerationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  context: string;

  @Column({ type: 'text', nullable: true })
  originalText: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  flags: string[];

  @Column({
    type: 'enum',
    enum: ModerationAction,
    default: ModerationAction.ALLOWED,
  })
  action: ModerationAction;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
