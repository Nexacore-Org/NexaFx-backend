import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  DEFAULT_WEBHOOK_SCHEMA_VERSION,
  WebhookSchemaVersion,
} from '../../modules/webhooks/schemas';

@Entity('webhook_endpoints')
export class WebhookEndpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  url: string;

  @Column()
  secret: string;

  @Column('text', { array: true })
  events: string[];

  @Column({ default: true })
  isActive: boolean;

  /**
   * Payload schema version this endpoint is pinned to. New endpoints default to
   * the latest version; endpoints that predate versioning were backfilled to
   * '1.0' so their payload shape did not change underneath them.
   */
  @Column({
    type: 'varchar',
    length: 10,
    default: DEFAULT_WEBHOOK_SCHEMA_VERSION,
  })
  preferredSchemaVersion: WebhookSchemaVersion;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
