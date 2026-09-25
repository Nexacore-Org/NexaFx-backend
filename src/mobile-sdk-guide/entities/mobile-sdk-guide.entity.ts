import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('mobile_sdk_guide')
export class MobileSdkGuide {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  platform: string;

  @Column({ type: 'varchar', length: 32 })
  sdkVersion: string;

  @Column({ type: 'varchar', length: 32 })
  minAppVersion: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  supportedEndpoints: string[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  authFlow: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
