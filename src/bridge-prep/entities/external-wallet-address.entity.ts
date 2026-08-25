import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { BlockchainNetwork } from './blockchain-network.entity';

export enum VerificationMethod {
  SIGNATURE = 'SIGNATURE',
  MANUAL = 'MANUAL',
  PENDING = 'PENDING'
}

@Entity('external_wallet_addresses')
export class ExternalWalletAddress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  networkId: string;

  @Column()
  address: string;

  @Column({ nullable: true })
  label: string;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'enum', enum: VerificationMethod, default: VerificationMethod.PENDING })
  verificationMethod: VerificationMethod;

  @ManyToOne(() => BlockchainNetwork)
  @JoinColumn({ name: 'networkId' })
  network: BlockchainNetwork;

  @CreateDateColumn()
  createdAt: Date;
}