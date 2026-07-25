import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('sandbox_events')
export class SandboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'uuid' })
  sandboxAccountId: string;
  @Column({ type: 'varchar', length: 100 })
  eventType: string;
  @Column({ type: 'jsonb', default: '{}' })
  data: any;
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
