import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('sms_provider_routes')
export class SmsProviderRoute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  @Index()
  countryCode: string; // e.g. "+234", "+1", "default"

  @Column({ type: 'varchar', length: 100 })
  providerName: string; // e.g. "twilio", "infobip", "messagebird"

  @Column({ type: 'int', default: 0 })
  priority: number; // lower number = higher priority

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
