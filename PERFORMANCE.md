# Performance Benchmarks

This document previously contained a hand-maintained, one-time snapshot of autocannon
latency numbers and a GZIP compression status table. Those numbers were never re-run
and one of the compression claims (`/v1/transactions`) was explicitly marked
`Verified: false`, which made the document misleading. The stale snapshot has been
removed in favour of an automated check that runs on every PR.

## Automated GZIP Compression Check

Compression behaviour is now asserted automatically by an end-to-end test that
exercises the real HTTP response pipeline (Supertest against the Nest app):

- `test/e2e/compression.e2e-spec.ts`

It verifies the documented `compression({ threshold: 1024 })` behaviour:

- A response body **over** the 1024-byte threshold is served with
  `Content-Encoding: gzip`.
- A response body **under** the 1024-byte threshold is served **without**
  `Content-Encoding: gzip`.

This test is wired into CI (`.github/workflows/ci-v2.yml`) and runs on every PR, so a
regression in the compression middleware (or a proxy/CDN stripping the header) is
caught automatically instead of relying on a document nobody re-runs.

## Reproducing a Fresh Benchmark On Demand

Latency benchmarks are intentionally **not** committed as static numbers. To produce a
fresh benchmark locally, run autocannon against a running instance of the API:

```bash
# Start the API (adjust to your local setup)
npm run start:dev

# Health endpoint
npx autocannon -c 100 -d 10 http://localhost:3000/v1/health

# Exchange rates endpoint
npx autocannon -c 100 -d 10 "http://localhost:3000/v1/exchange-rates?from=USD&to=NGN"

# Transactions endpoint (requires an authenticated session)
npx autocannon -c 100 -d 10 -H "Authorization: Bearer <token>" http://localhost:3000/v1/transactions
```

Record the results in the PR description or an external dashboard rather than
committing them here, so this file never drifts out of date again.

## Verification
- Missing indexes created via TypeORM migration.
- N+1 queries resolved.
- Redis caching for expensive aggregates enabled.
- GZIP compression asserted automatically in CI (see above).
