import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum RestrictionType {
  BLOCK_SEND = 'BLOCK_SEND',
  BLOCK_RECEIVE = 'BLOCK_RECEIVE',
  BLOCK_ALL = 'BLOCK_ALL',
  LIMIT = 'LIMIT',
}

@Entity('geo_restrictions')
@Index(['countryCode', 'isActive'])
export class GeoRestriction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 2 })
  @Index()
  countryCode: string;

  @Column({ type: 'enum', enum: RestrictionType })
  restrictionType: RestrictionType;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  limitAmountUsd: string | null;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
