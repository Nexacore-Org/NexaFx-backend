import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  endpointId: string;

  @Column()
  eventType: string;

  @Column('jsonb')
  payload: any;

  @Column({ nullable: true })
  responseStatus: number;

  @Column('text', { nullable: true })
  responseBody: string;

  @Column({ default: 0 })
  attemptCount: number;

  @Index()
  @Column({ type: 'timestamp', nullable: true })
  nextRetryAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}