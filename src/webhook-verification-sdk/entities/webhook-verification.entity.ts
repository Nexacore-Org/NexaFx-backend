import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Persisted record of a webhook signature verification attempt performed
 * via the verification SDK surface.
 *
 * Raw secrets are never stored — only a 16-hex-char SHA-256 fingerprint of the
 * provided secret (enough to correlate attempts against a key without being
 * reversible) and a SHA-256 hash of the raw payload.
 */
@Entity('webhook_verifications')
@Index(['valid', 'createdAt'])
export class WebhookVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** SHA-256 hex digest of the raw payload that was verified. */
  @Column({ type: 'varchar', length: 64 })
  payloadHash: string;

  /** The `X-NexaFX-Signature` header value that was provided. */
  @Column({ type: 'varchar', length: 256 })
  signatureHeader: string;

  /** 16-hex-char SHA-256 fingerprint of the shared secret used. */
  @Column({ type: 'varchar', length: 16 })
  secretFingerprint: string;

  @Column()
  valid: boolean;

  /** Machine-readable reason when the verification failed. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}