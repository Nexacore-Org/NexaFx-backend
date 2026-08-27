import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum TransactionCategoryColor {
  RED = '#EF4444',
  ORANGE = '#F97316',
  YELLOW = '#EAB308',
  GREEN = '#22C55E',
  BLUE = '#3B82F6',
  INDIGO = '#6366F1',
  PURPLE = '#A855F7',
  PINK = '#EC4899',
  GRAY = '#6B7280',
}

@Index(['userId'])
@Entity('transaction_categories')
export class TransactionCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 10, default: '📦' })
  icon: string;

  @Column({ type: 'varchar', length: 7, default: '#6366f1' })
  color: string;

  @Column({ type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
