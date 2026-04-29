import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum StellarNetwork {
  TESTNET = 'TESTNET',
  PUBLIC = 'PUBLIC',
}

@Entity('wallets')
@Index(['userId'])
@Index(['userId', 'publicKey'], { unique: true })
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 56 })
  publicKey: string;

  /** Encrypted Stellar secret; null for watch-only wallets */
  @Column({ type: 'text', nullable: true })
  encryptedSecretKey: string | null;

  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 10 })
  network: StellarNetwork;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
