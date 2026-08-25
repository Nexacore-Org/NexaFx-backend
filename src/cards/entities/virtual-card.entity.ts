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

export enum CardStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CANCELLED = 'CANCELLED',
}

@Entity('virtual_cards')
@Index(['userId'])
export class VirtualCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  stripeCardId: string;

  @Column({ type: 'varchar', length: 4 })
  last4: string;

  @Column({ type: 'varchar', length: 10 })
  expMonth: string;

  @Column({ type: 'varchar', length: 4 })
  expYear: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brand: string;

  @Column({
    type: 'enum',
    enum: CardStatus,
    default: CardStatus.ACTIVE,
  })
  status: CardStatus;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  spendLimit: string;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  blockedMccs: string[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
