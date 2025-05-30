import { User } from 'src/user/entities/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
// import { User } from '../../users/entities/user.entity'; 

@Entity('external_wallets')
@Index(['userId', 'address'], { unique: true })
export class ExternalWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 42 })
  @Index()
  address: string;

  @Column({ type: 'varchar', length: 20 })
  network: string; // ethereum, polygon, etc.

  @Column({ type: 'varchar', length: 50 })
  walletType: string; // metamask, walletconnect, etc.

  @Column({ type: 'text', nullable: true })
  label: string; // user-defined label

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastUsed: Date;

  @Column({ type: 'text' })
  verificationSignature: string;

  @Column({ type: 'text' })
  verificationMessage: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.externalWallets, { onDelete: 'CASCADE' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}