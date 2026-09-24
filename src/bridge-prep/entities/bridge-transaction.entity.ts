import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { BlockchainNetwork } from './blockchain-network.entity';

export enum BridgeTxStatus {
  INITIATED = 'INITIATED',
  LOCKED = 'LOCKED',
  BRIDGING = 'BRIDGING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED'
}

@Entity('bridge_transactions')
export class BridgeTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  sourceNetworkId: string;

  @Column()
  destinationNetworkId: string;

  @Column()
  sourceAddress: string;

  @Column()
  destinationAddress: string;

  @Column()
  assetCode: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount: number;

  @Column({ type: 'enum', enum: BridgeTxStatus, default: BridgeTxStatus.INITIATED })
  status: BridgeTxStatus;

  @Column({ nullable: true })
  sourceTxHash: string;

  @Column({ nullable: true })
  destinationTxHash: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  feeAmount: number;

  @ManyToOne(() => BlockchainNetwork)
  @JoinColumn({ name: 'sourceNetworkId' })
  sourceNetwork: BlockchainNetwork;

  @ManyToOne(() => BlockchainNetwork)
  @JoinColumn({ name: 'destinationNetworkId' })
  destinationNetwork: BlockchainNetwork;

  @CreateDateColumn()
  createdAt: Date;
}