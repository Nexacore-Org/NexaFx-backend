import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { WebhookVerification } from './entities/webhook-verification.entity';
import { VerifyWebhookSignatureDto } from './dto/verify-webhook-signature.dto';
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_HEADER_PATTERN,
  WEBHOOK_SIGNATURE_SCHEME,
} from './webhook-verification-sdk.constants';

export interface WebhookVerificationOutcome {
  valid: boolean;
  /** Machine-readable reason set whenever `valid` is false. */
  reason?: string;
  scheme: typeof WEBHOOK_SIGNATURE_SCHEME;
  verificationId: string;
  verifiedAt: string;
}

export interface WebhookVerificationSpec {
  scheme: typeof WEBHOOK_SIGNATURE_SCHEME;
  headerName: string;
  /** Signed over the raw request body string, byte-for-byte. */
  signedPayloadHint: string;
}

/**
 * Server-side reference implementation of the NexaFX webhook signature
 * scheme. Webhook *recipients* use these helpers to verify the
 * `X-NexaFX-Signature` header on incoming payloads.
 *
 * The scheme is HMAC-SHA256 over the raw body string, matching
 * `src/webhooks/services/webhook.service.ts`. Every verification performed
 * through `verify()` is persisted so operators can audit who checked which
 * payload with which key fingerprint.
 */
@Injectable()
export class WebhookVerificationSdkService {
  constructor(
    @InjectRepository(WebhookVerification)
    private readonly verificationRepo: Repository<WebhookVerification>,
  ) {}

  /**
   * Constant-time verification of a NexaFX-signed webhook payload.
   *
   * @param payload raw request body exactly as received from NexaFX
   * @param signatureHeader value of the `X-NexaFX-Signature` header
   * @param secret shared HMAC secret for the webhook endpoint
   */
  verifySignature(
    payload: string | Buffer,
    signatureHeader: string,
    secret: string,
  ): boolean {
    return this.evaluate(payload, signatureHeader, secret).valid;
  }

  /**
   * Verify a payload and persist the attempt as an auditable record. Never
   * throws for a tampered payload — a mismatch is a normal `{ valid: false }`
   * result, not an exception (the caller decides how to respond).
   */
  async verify(
    dto: VerifyWebhookSignatureDto,
  ): Promise<WebhookVerificationOutcome> {
    const { valid, reason } = this.evaluate(dto.payload, dto.signature, dto.secret);

    const record = this.verificationRepo.create({
      payloadHash: this.hash(dto.payload),
      signatureHeader: dto.signature,
      secretFingerprint: this.secretFingerprint(dto.secret),
      valid,
      reason: reason ?? null,
    });
    const saved = await this.verificationRepo.save(record);

    return {
      valid,
      ...(reason !== undefined && { reason }),
      scheme: WEBHOOK_SIGNATURE_SCHEME,
      verificationId: saved.id,
      verifiedAt: saved.createdAt.toISOString(),
    };
  }

  /** Recent verification attempts, newest first. */
  async listVerifications(
    limit = 50,
    offset = 0,
  ): Promise<WebhookVerification[]> {
    return this.verificationRepo.find({
      order: { createdAt: 'DESC' },
      skip: offset,
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  /** Metadata describing the signature scheme this endpoint documents. */
  getSpec(): WebhookVerificationSpec {
    return {
      scheme: WEBHOOK_SIGNATURE_SCHEME,
      headerName: WEBHOOK_SIGNATURE_HEADER,
      signedPayloadHint:
        'The HMAC is computed over the raw body string. Never re-serialize the payload before verifying.',
    };
  }

  private evaluate(
    payload: string | Buffer,
    signatureHeader: string,
    secret: string,
  ): { valid: boolean; reason?: string } {
    if (!payload || payload.length === 0) {
      return { valid: false, reason: 'empty payload' };
    }
    if (!secret || secret.length === 0) {
      return { valid: false, reason: 'missing secret' };
    }
    if (!signatureHeader || !WEBHOOK_SIGNATURE_HEADER_PATTERN.test(signatureHeader)) {
      return {
        valid: false,
        reason: `malformed signature header (expected ${WEBHOOK_SIGNATURE_SCHEME}=<64 lowercase hex characters>)`,
      };
    }

    const expected = signatureHeader.slice(`${WEBHOOK_SIGNATURE_SCHEME}=`.length);
    const computed = this.computeSignature(payload, secret);

    if (!this.constantTimeEqual(computed, expected)) {
      return { valid: false, reason: 'signature mismatch' };
    }
    return { valid: true };
  }

  private computeSignature(payload: string | Buffer, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  private hash(payload: string | Buffer): string {
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  private secretFingerprint(secret: string): string {
    return this.hash(secret).slice(0, 16);
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }
}