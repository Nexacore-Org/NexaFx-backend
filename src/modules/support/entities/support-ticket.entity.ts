import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../../users/user.entity';
import { TicketMessage } from './ticket-message.entity';

export enum SupportTicketCategory {
  TRANSACTION = 'TRANSACTION',
  KYC = 'KYC',
  ACCOUNT = 'ACCOUNT',
  TECHNICAL = 'TECHNICAL',
  OTHER = 'OTHER',
}

export enum SupportTicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum SupportTicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_USER = 'PENDING_USER',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  ticketNumber: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  assignedTo: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignedTo' })
  assignedToUser: User | null;

  @Column({ length: 255 })
  subject: string;

  @Column({
    type: 'enum',
    enum: SupportTicketCategory,
  })
  category: SupportTicketCategory;

  @Column({
    type: 'enum',
    enum: SupportTicketPriority,
  })
  priority: SupportTicketPriority;

  @Column({
    type: 'enum',
    enum: SupportTicketStatus,
    default: SupportTicketStatus.OPEN,
  })
  status: SupportTicketStatus;

  @Column({ type: 'timestamp with time zone' })
  slaDeadlineAt: Date;

  @Column({ default: false })
  isSlaBreached: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToMany(() => TicketMessage, (message) => message.ticket)
  messages: TicketMessage[];
}
