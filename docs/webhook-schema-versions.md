# Webhook Schema Versions

Every webhook NexaFX delivers carries a `schemaVersion` field. A breaking change to
a payload's shape introduces a **new** version — an already-published version is
never modified in place. At least two versions are deliverable at all times, and
a deprecated version stays deliverable for **at least 90 days** after it is
marked deprecated.

```json
{
  "id": "6f1a6d0c-6f4e-4a37-9e19-0f9a7c1b2d34",
  "event": "transaction.completed",
  "schemaVersion": "2.0",
  "data": { "...": "shape depends on schemaVersion" },
  "timestamp": "2026-07-29T10:15:30.000Z"
}
```

The envelope (`id`, `event`, `schemaVersion`, `data`, `timestamp`) is stable
across versions. Only `data` changes shape.

`id` identifies the **event**, not the delivery. If you register several
endpoints for the same event — even on different schema versions — they all
receive the same `id`, so you can deduplicate and correlate across them.

---

## Version registry

| Version | Effective from | Deprecated on | Sunset (deliveries stop) | Status         |
| ------- | -------------- | ------------- | ------------------------ | -------------- |
| `1.0`   | 2025-01-15     | 2026-07-29    | 2026-10-27               | **Deprecated** |
| `2.0`   | 2026-07-29     | —             | —                        | **Current**    |

Machine-readable version of this table:

```
GET /v2/webhooks/schema-versions
```

```json
[
  {
    "version": "1.0",
    "effectiveFrom": "2025-01-15",
    "deprecatedOn": "2026-07-29",
    "sunsetOn": "2026-10-27"
  },
  {
    "version": "2.0",
    "effectiveFrom": "2026-07-29",
    "deprecatedOn": null,
    "sunsetOn": null
  }
]
```

---

## Pinning an endpoint to a version

Each endpoint carries a `preferredSchemaVersion`. Deliveries to that endpoint are
shaped for that version.

- Endpoints created **before 2026-07-29** were backfilled to `1.0`, so their
  payload shape did not change underneath them.
- Endpoints created **on or after 2026-07-29** default to `2.0`.

Change it at any time — the switch takes effect on the next event, and no
redeploy or re-registration is needed:

```
PATCH /v2/webhooks/:id
Content-Type: application/json
Authorization: Bearer <token>

{ "preferredSchemaVersion": "2.0" }
```

`preferredSchemaVersion` must be one of `1.0` or `2.0`; anything else is rejected
with `400 Bad Request`. You can also set it at creation time:

```
POST /v2/webhooks

{
  "url": "https://example.com/hooks/nexafx",
  "events": ["transaction.completed"],
  "preferredSchemaVersion": "2.0"
}
```

Roll-out tip: register a **second** endpoint pinned to `2.0` alongside your
existing `1.0` one, verify the new shape against real traffic, then delete the
`1.0` endpoint. Both endpoints receive the same event `id`, so you can prove the
two shapes describe the same event before cutting over.

---

## Delivery headers

| Header                          | Sent when            | Value                                                   |
| ------------------------------- | -------------------- | ------------------------------------------------------- |
| `X-NexaFX-Schema-Version`       | always               | `1.0` \| `2.0`                                          |
| `X-NexaFX-Signature`            | always               | `sha256=<hmac of the raw request body>`                 |
| `X-NexaFX-Schema-Deprecated`    | deprecated versions  | `true`                                                  |
| `Deprecation`                   | deprecated versions  | `true` (RFC 8594)                                       |
| `Sunset`                        | deprecated versions  | HTTP-date, e.g. `Tue, 27 Oct 2026 00:00:00 GMT`         |
| `Link`                          | deprecated versions  | `<…/webhooks/schema-versions>; rel="deprecation"`       |

Every delivery on a deprecated version also writes a
`webhook.deprecated_schema_used` audit event against the endpoint, so support can
see which integrations still need to migrate.

Assert on `X-NexaFX-Schema-Version` in your handler rather than inferring the
shape from the fields present — it makes an unexpected version a loud failure
instead of silently-null data.

---

## What changed in 2.0

`2.0` affects the `transaction.completed` and `transaction.failed` payloads. All
other events (`kyc.approved`, `kyc.rejected`, `kyc.resubmission_required`,
`rate_alert.triggered`, `referral.rewarded`, `ping`) have an unchanged `data`
shape on both versions — only the envelope's `schemaVersion` differs.

### `transaction.completed` / `transaction.failed`

**v1.0** serialised the internal transaction record verbatim. Decimals arrived as
strings, enums kept their uppercase database casing, and every column on the
record — including internal bookkeeping fields — ended up on the wire.

```json
{
  "id": "b23f...",
  "userId": "9a71...",
  "type": "SWAP",
  "status": "SUCCESS",
  "amount": "150.00000000",
  "currency": "USD",
  "rate": "1550.25000000",
  "feeAmount": "1.50000000",
  "feeCurrency": "USD",
  "toCurrency": "NGN",
  "toAmount": "232537.50000000",
  "txHash": "e3b0c442...",
  "reference": "ref-9",
  "counterpartyMemo": "invoice 42",
  "failureReason": null,
  "createdAt": "2026-07-01T10:00:00.000Z",
  "updatedAt": "2026-07-01T10:05:00.000Z",
  "userNote": "…",
  "searchVector": "…",
  "processingLockedBy": "…",
  "metadata": {}
}
```

**v2.0** is an explicitly curated payload:

```json
{
  "transactionId": "b23f...",
  "userId": "9a71...",
  "type": "swap",
  "status": "success",
  "amount": 150,
  "currency": "USD",
  "fee": { "amount": 1.5, "currency": "USD" },
  "conversion": {
    "fromCurrency": "USD",
    "toCurrency": "NGN",
    "toAmount": 232537.5,
    "rate": 1550.25
  },
  "memo": "invoice 42",
  "reference": "ref-9",
  "stellarTxHash": "e3b0c442...",
  "failureReason": null,
  "createdAt": "2026-07-01T10:00:00.000Z",
  "updatedAt": "2026-07-01T10:05:00.000Z"
}
```

### Breaking changes

| # | Change                                                                                            | Why                                                                                       |
| - | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1 | `data.id` → `data.transactionId`                                                                  | `data.id` read as the envelope's event `id` and was a recurring source of consumer bugs.  |
| 2 | Decimals are JSON numbers, not numeric-as-string (`amount`, `rate`, `toAmount`, `fee.amount`)      | Every consumer was parsing them anyway.                                                   |
| 3 | `feeAmount` + `feeCurrency` → nested `fee`, `null` when no fee was charged                         | Distinguishes "no fee" from "fee of zero" without a second field to check.                |
| 4 | `rate` + `toCurrency` + `toAmount` → nested `conversion`, `null` for non-converting transactions   | Groups the fields that are only ever populated together.                                  |
| 5 | `txHash` → `stellarTxHash`                                                                        | Names the chain the hash belongs to.                                                      |
| 6 | `counterpartyMemo` → `memo`                                                                       | Matches the field's public name in the REST API.                                          |
| 7 | `type` and `status` are lowercase (`SWAP` → `swap`, `SUCCESS` → `success`)                          | Consistent with event names and the rest of the v2 API.                                   |
| 8 | Internal columns removed: `userNote`, `searchVector`, `processingLockedAt`, `processingLockedBy`, `categoryId`, `metadata`, `tags`, `confidenceScore`, `confidenceLabel`, `expectedCompletionSeconds` | Internal bookkeeping. **`userNote` is the payer's private note and should never have been delivered** — this is the main reason to migrate off `1.0`. |

Fields absent from the source record arrive as `null` in v2 rather than being
omitted, so the key set is stable.

---

## Migration guide: 1.0 → 2.0

**1. Read `schemaVersion` before touching `data`.**

```ts
function handleWebhook(body: WebhookEnvelope) {
  switch (body.schemaVersion) {
    case '1.0':
      return handleTransactionV1(body.data);
    case '2.0':
      return handleTransactionV2(body.data);
    default:
      // A version you have not deployed support for. Store and alert —
      // do not silently drop.
      throw new Error(`Unhandled webhook schema ${body.schemaVersion}`);
  }
}
```

**2. Map the fields.**

| v1.0                             | v2.0                                          |
| -------------------------------- | --------------------------------------------- |
| `data.id`                        | `data.transactionId`                          |
| `parseFloat(data.amount)`        | `data.amount`                                 |
| `data.status === 'SUCCESS'`      | `data.status === 'success'`                   |
| `data.type === 'SWAP'`           | `data.type === 'swap'`                        |
| `parseFloat(data.feeAmount)`     | `data.fee?.amount ?? 0`                       |
| `data.feeCurrency`               | `data.fee?.currency`                          |
| `parseFloat(data.rate)`          | `data.conversion?.rate`                       |
| `data.toCurrency`                | `data.conversion?.toCurrency`                 |
| `parseFloat(data.toAmount)`      | `data.conversion?.toAmount`                   |
| `data.txHash`                    | `data.stellarTxHash`                          |
| `data.counterpartyMemo`          | `data.memo`                                   |
| `data.userNote` and other internals | *not available* — fetch via the REST API if genuinely needed |

**3. Deploy the v2 branch of your handler** while still pinned to `1.0`. It is
dead code until you flip the version, so this step is safe to ship on its own.

**4. Flip the endpoint.**

```
PATCH /v2/webhooks/:id   { "preferredSchemaVersion": "2.0" }
```

**5. Confirm the cutover.** `X-NexaFX-Schema-Deprecated` and `Sunset` stop
appearing, and `X-NexaFX-Schema-Version` reads `2.0`. Use
`GET /v2/webhooks/:id/deliveries` to inspect recent payloads.

Rollback is a single `PATCH` back to `"1.0"` at any point before the sunset date.

---

## Deprecation timeline

| Date       | What happens                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 2025-01-15 | `1.0` becomes available.                                                                                          |
| 2026-07-29 | `2.0` becomes available and is the default for new endpoints. `1.0` is marked deprecated; existing endpoints stay on it and start receiving `Deprecation`/`Sunset` headers. The 90-day window opens. |
| 2026-10-27 | `1.0` sunset. Endpoints still pinned to `1.0` are migrated to `2.0` and receive the v2 shape.                      |

Policy for every future version:

- A version is deliverable for **at least 90 days** after it is marked
  deprecated.
- At least **two** versions are deliverable at all times.
- An already-published version's payload shape is **never** modified. Additive or
  breaking, a change to `data` means a new version.
- Adding a field to the **envelope** is additive and is not a version bump —
  parse the envelope non-strictly.

---

## Implementation notes

| Concern                          | Location                                                             |
| -------------------------------- | -------------------------------------------------------------------- |
| Version registry, deprecation metadata, headers | `src/modules/webhooks/schemas/webhook-schema-version.ts` |
| Envelope types                   | `src/modules/webhooks/schemas/webhook-payload.types.ts`               |
| v1.0 payload builder (frozen)    | `src/modules/webhooks/schemas/transaction-completed.v1.ts`            |
| v2.0 payload builder             | `src/modules/webhooks/schemas/transaction-completed.v2.ts`            |
| `WebhookSchemaTransformer`       | `src/modules/webhooks/schemas/webhook-schema.transformer.ts`          |
| Endpoint preference column       | `src/webhooks/entities/webhook-endpoint.entity.ts`                    |

### Adding version 3.0

1. Add `'3.0'` to `WEBHOOK_SCHEMA_VERSIONS` and set
   `LATEST_WEBHOOK_SCHEMA_VERSION`.
2. Add its `WEBHOOK_SCHEMA_VERSION_REGISTRY` entry, and set `deprecatedOn` /
   `sunsetOn` (≥ 90 days later) on the version being retired.
3. Add `<event>.v3.ts` builders and register them in `SCHEMA_REGISTRY`. **Leave
   the older builders untouched.**
4. Drop the sunset version from `WEBHOOK_SCHEMA_VERSIONS` only once its sunset
   date has passed and no endpoint is still pinned to it — keeping at least two
   versions live.
5. Update the tables above.

Events with no entry in `SCHEMA_REGISTRY` pass `data` through unchanged on every
version, so a new event does not need per-version builders until its shape first
breaks.
