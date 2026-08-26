import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('merchant_api_keys')
export class MerchantApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  merchantId: string;

  @Column()
  keyHash: string;

  @Column('simple-array', { default: [] })
  scopes: string[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}