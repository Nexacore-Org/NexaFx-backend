import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';

@Index(['userId', 'currency'])
@Index(['userId', 'currency', 'remainingQuantity'])
@Entity('cost_basis_lots')
export class CostBasisLot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  quantity: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  costBasisUsd: string;

  @Column({ type: 'timestamp' })
  acquiredAt: Date;

  @Column({ type: 'uuid' })
  sourceTransactionId: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  remainingQuantity: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
