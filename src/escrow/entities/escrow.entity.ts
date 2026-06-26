import { Exclude } from 'class-transformer';
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

export enum EscrowStatus {
  PENDING = 'PENDING',
  FUNDED = 'FUNDED',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
  DISPUTED = 'DISPUTED',
  RESOLVED = 'RESOLVED',
}

@Index(['senderId', 'recipientId'])
@Index(['status', 'autoReleaseAt'])
@Entity('escrows')
export class Escrow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  senderId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @Column('uuid')
  recipientId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipientId' })
  recipient: User;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: EscrowStatus,
    default: EscrowStatus.PENDING,
  })
  status: EscrowStatus;

  @Column({ type: 'text' })
  releaseCondition: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  autoReleaseAt: Date | null;

  @Column({ type: 'int', default: 24 })
  disputeWindowHours: number;

  @Column({ type: 'varchar', length: 56, nullable: true })
  stellarEscrowPublicKey: string | null;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'text', nullable: true })
  stellarEscrowSecretEncrypted: string | null;

  @Column({ type: 'text', nullable: true })
  fundedTxHash: string | null;

  @Column({ type: 'text', nullable: true })
  releaseTxHash: string | null;

  @Column({ type: 'text', nullable: true })
  refundTxHash: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  fundedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  releasedAt: Date | null;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
