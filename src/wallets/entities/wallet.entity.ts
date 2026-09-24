import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum StellarNetwork {
  TESTNET = 'TESTNET',
  PUBLIC = 'PUBLIC',
}

@Entity('wallets')
@Index(['userId'])
@Index('UQ_wallets_user_currency', ['userId', 'currency'], { unique: true, where: `"currency" <> 'XLM'` })
@Index('UQ_wallets_user_publicKey', ['userId', 'publicKey'], { unique: true, where: `"publicKey" IS NOT NULL` })
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 10, default: 'XLM' })
  currency: string;

  @Column({
    type: 'numeric',
    precision: 20,
    scale: 8,
    default: '0.00000000',
  })
  balance: string;

  @Column({ type: 'varchar', length: 56, nullable: true })
  publicKey: string | null;

  @Column({ type: 'text', nullable: true })
  encryptedSecretKey: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Primary' })
  label: string;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 10, default: StellarNetwork.TESTNET })
  network: StellarNetwork;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
