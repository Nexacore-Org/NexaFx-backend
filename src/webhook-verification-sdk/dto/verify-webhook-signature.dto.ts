import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_SCHEME,
} from '../webhook-verification-sdk.constants';

/**
 * Request body for verifying a NexaFX-signed webhook payload.
 *
 * The recipient posts the raw body string exactly as it was received, the value
 * of the `X-NexaFX-Signature` header, and the shared secret provisioned for the
 * endpoint. The service recomputes the HMAC and compares constant-time.
 */
export class VerifyWebhookSignatureDto {
  @ApiProperty({
    description:
      'Raw webhook payload string, exactly as received in the request body. ' +
      'Do not re-serialize the JSON object, or the signature will not match.',
    example: '{"id":"evt_123","type":"transaction.completed","createdAt":"2026-09-24T00:00:00.000Z"}',
  })
  @IsString()
  @IsNotEmpty()
  payload: string;

  @ApiProperty({
    description:
      `Value of the "${WEBHOOK_SIGNATURE_HEADER}" header. ` +
      `Expected format: \`${WEBHOOK_SIGNATURE_SCHEME}=<64 lowercase hex characters>\`.`,
    example:
      'sha256=9c4f9d5f2d9a9c47b1d0c2b4d6f8a0e1c3b5d7f9a1c3e5b7d9f0a2c4e6b8a0d1',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^sha256=[0-9a-f]{64}$/, {
    message: 'signature must match the format sha256=<64 lowercase hex characters>',
  })
  signature: string;

  @ApiProperty({
    description:
      'Shared HMAC secret provisioned for the webhook endpoint. ' +
      'Should be kept out of logs and never returned by any endpoint.',
    example: 'c7f8f1a3b2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0',
  })
  @IsString()
  @IsNotEmpty()
  secret: string;
}