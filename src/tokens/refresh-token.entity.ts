import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { DB_COLUMN_TYPES } from '../common/database/column-types';

@Entity('refresh_tokens')
@Index(['userId', 'revokedAt'])
@Index(['tokenHash'], { unique: true })
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255, unique: true })
  tokenHash: string;

  @Column({ type: DB_COLUMN_TYPES.timestamp })
  expiresAt: Date;

  @Column({ type: DB_COLUMN_TYPES.timestamp, nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: DB_COLUMN_TYPES.timestamp })
  createdAt: Date;
}
