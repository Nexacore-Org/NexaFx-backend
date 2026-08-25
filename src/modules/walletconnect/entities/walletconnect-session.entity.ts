import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../../users/user.entity';

@Entity('walletconnect_sessions')
export class WalletConnectSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  sessionTopic: string;

  @Column({ type: 'varchar', length: 64 })
  walletPublicKey: string;

  @Column({ type: 'jsonb', default: '{}' })
  peerMetadata: {
    name?: string;
    description?: string;
    url?: string;
    icons?: string[];
  };

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  nexafxUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'nexafxUserId' })
  user: User | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
