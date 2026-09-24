/**
 * NexaFX webhook signature scheme.
 *
 * Mirrors the signing implementation in
 * `src/webhooks/services/webhook.service.ts#executeDelivery`:
 *
 *   signature = HMAC_SHA256(endpoint.secret, rawRequestBodyString).hexdigest()
 *   header    = `${WEBHOOK_SIGNATURE_SCHEME}=${signature}`
 *
 * The recipient must verify over the *raw* body string — re-serializing a JSON
 * object changes the bytes and makes the signature fail.
 */
export const WEBHOOK_SIGNATURE_SCHEME = 'sha256';

export const WEBHOOK_SIGNATURE_HEADER = 'X-NexaFX-Signature';

/** `sha256=` plus 64 lowercase hex characters. */
export const WEBHOOK_SIGNATURE_HEADER_PATTERN = /^sha256=[0-9a-f]{64}$/;

/** Sample header value used by the Swagger examples for this module. */
export const WEBHOOK_SIGNATURE_EXAMPLE =
  'sha256=9c4f9d5f2d9a9c47b1d0c2b4d6f8a0e1c3b5d7f9a1c3e5b7d9f0a2c4e6b8a0d1';