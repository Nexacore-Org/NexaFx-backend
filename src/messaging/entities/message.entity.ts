import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum MessageType {
  DIRECT = 'DIRECT',
  BROADCAST = 'BROADCAST',
}

@Index(['conversationId', 'createdAt'])
@Index(['recipientId', 'isRead'])
@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @Column('uuid')
  senderId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @Column('uuid', { nullable: true })
  recipientId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipientId' })
  recipient: User;

  @Column('text')
  body: string;

  @Column('simple-array', { nullable: true })
  attachmentKeys: string[];

  @Column({ default: false })
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  @Column({ type: 'enum', enum: MessageType, default: MessageType.DIRECT })
  type: MessageType;

  @Column('uuid', { nullable: true })
  broadcastId: string;

  @CreateDateColumn()
  createdAt: Date;
}
