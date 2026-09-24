import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('aml_config')
export class AmlConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 10000 })
  largeTxThresholdUsd: number;

  @Column({ type: 'int', default: 5 })
  rapidMovementCount: number;

  @Column({ type: 'int', default: 60 })
  rapidMovementWindowMinutes: number;

  @Column({ type: 'int', default: 30 })
  roundTripWindowMinutes: number;

  @Column({ type: 'int', default: 3 })
  structuringCount: number;

  @Column({ type: 'int', default: 24 })
  structuringWindowHours: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 5000 })
  newAccountLargeTxThresholdUsd: number;

  @Column({ type: 'int', default: 7 })
  newAccountAgeDays: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
