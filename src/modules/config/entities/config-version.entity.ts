import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('config_versions')
export class ConfigVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  configKey: string;

  @Column({ type: 'jsonb' })
  oldValue: any;

  @Column({ type: 'jsonb' })
  newValue: any;

  @Column({ type: 'uuid' })
  changedBy: string;

  @Column({ type: 'text', nullable: true })
  changeReason: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  changedAt: Date;
}
