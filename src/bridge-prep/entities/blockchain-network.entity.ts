import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum AddressFormatType {
  STELLAR = 'STELLAR',
  EVM = 'EVM',
  SOLANA = 'SOLANA',
  BASE58 = 'BASE58'
}

@Entity('blockchain_networks')
export class BlockchainNetwork {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string; // e.g., Stellar, Ethereum, Solana, BNB Chain

  @Column({ nullable: true })
  chainId: string;

  @Column()
  symbol: string;

  @Column({ type: 'boolean', default: false })
  isSupported: boolean;

  @Column()
  explorerUrl: string;

  @Column({ type: 'integer' })
  avgConfirmationSeconds: number;

  @Column({ type: 'enum', enum: AddressFormatType })
  addressFormat: AddressFormatType;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}