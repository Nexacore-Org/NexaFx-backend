// src/data-residency/entities/data-residency-policy.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum DataRegion {
  EU = 'EU',
  US = 'US',
  UNRESTRICTED = 'UNRESTRICTED',
}

@Entity('data_residency_policies')
@Index(['userId'], { unique: true })
export class DataResidencyPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({
    type: 'enum',
    enum: DataRegion,
    default: DataRegion.UNRESTRICTED,
  })
  requiredRegion: DataRegion;

  @Column({ type: 'varchar' })
  setByAdminId: string;

  @CreateDateColumn()
  setAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}