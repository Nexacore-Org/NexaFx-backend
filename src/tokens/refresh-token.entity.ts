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

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
