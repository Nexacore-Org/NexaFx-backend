import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
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

@Entity('transaction_categories')
@Index(['userId', 'name'], { unique: true })
export class TransactionCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'color', length: 7, nullable: true })
  color: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
