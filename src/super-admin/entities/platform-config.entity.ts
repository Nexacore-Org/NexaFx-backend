import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('platform_configs')
export class PlatformConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  key: string;

  @Column({ type: 'jsonb' })
  value: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255 })
  category: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get maintenanceMode(): boolean {
    if (typeof this.value === 'boolean') {
      return this.value;
    }

    return Boolean(this.value?.maintenanceMode ?? this.value?.enabled ?? false);
  }

  set maintenanceMode(enabled: boolean) {
    this.value = { ...(this.value ?? {}), maintenanceMode: enabled };
  }
}
