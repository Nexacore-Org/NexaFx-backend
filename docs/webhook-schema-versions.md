# Webhook Schema Versions

This document describes the schema versions supported by NexaFX webhook
deliveries and how consumers should verify the authenticity and freshness of
each request.

## Schema version headers

Every delivery includes the following headers so consumers can select the
correct payload schema:

| Header | Description |
| --- | --- |
| `X-NexaFX-Schema-Version` | The schema version of the JSON body (e.g. `1`). |
| `X-NexaFX-Event` | The event type that triggered the delivery. |
| `X-NexaFX-Delivery-Id` | A unique identifier for this delivery attempt. |
| `X-NexaFX-Timestamp` | Unix epoch seconds at which the delivery was signed. |
| `X-NexaFX-Signature` | HMAC-SHA256 signature (see below). |
| `X-NexaFX-Signature-V2` | HMAC-SHA256 signature over the timestamped payload (see below). |

## Signature verification

### v2 (recommended)

The v2 signature is computed over the concatenation of the timestamp and the
raw request body, separated by a `.`:

```
signed_payload = `${X-NexaFX-Timestamp}.${raw_body}`
signature      = HMAC_SHA256(secret, signed_payload)
```

The result is hex-encoded and sent in the `X-NexaFX-Signature-V2` header.

Consumers **must** verify the signature against the raw request body (before
any JSON parsing or re-serialization) and **must** reject requests whose
`X-NexaFX-Timestamp` falls outside an acceptable tolerance window. A tolerance
of **5 minutes** (300 seconds) is recommended:

```ts
const toleranceSeconds = 300;
const now = Math.floor(Date.now() / 1000);
const ts = Number(req.headers['x-nexafx-timestamp']);

if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceSeconds) {
  // Reject: stale or replayed request.
  return res.status(401).end();
}

const signedPayload = `${ts}.${rawBody}`;
const expected = crypto
  .createHmac('sha256', secret)
  .update(signedPayload)
  .digest('hex');

const provided = req.headers['x-nexafx-signature-v2'];
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
  // Reject: invalid signature.
  return res.status(401).end();
}
```

Because the timestamp is part of the signed payload, an attacker cannot alter
it without invalidating the signature, and a captured request becomes useless
once it falls outside the tolerance window. Consumers should additionally
track `X-NexaFX-Delivery-Id` to deduplicate retries.

### v1 (legacy)

During the transition period the legacy `X-NexaFX-Signature` header is still
sent. It is computed over the raw request body only:

```
signature = HMAC_SHA256(secret, raw_body)
```

This scheme is **not** replay-safe because the body carries no timestamp.
Consumers should migrate to `X-NexaFX-Signature-V2` as soon as possible.

## Secret rotation

Endpoint secrets can be rotated without downtime via:

```
POST /webhooks/:id/rotate-secret
```

The response returns the new secret exactly once; it is never returned again
by list or patch operations. The endpoint owner is the only principal allowed
to rotate a secret; requests from other users receive `404 Not Found`.

During rotation the previous secret remains valid for a short grace window so
in-flight deliveries signed with the old secret are not rejected. When a grace
window is active, deliveries include both signatures:

| Header | Signed with |
| --- | --- |
| `X-NexaFX-Signature-V2` | Current secret. |
| `X-NexaFX-Signature-V2-Previous` | Previous secret (grace window only). |

Consumers should accept a delivery if **either** signature verifies, and
should stop accepting the previous signature once the grace window elapses.
