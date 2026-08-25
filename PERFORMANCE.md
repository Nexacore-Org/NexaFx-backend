# Performance Benchmarks

This file outlines the response time benchmarks for core NexaFX API endpoints. All tests were executed under a simulated load of 100 concurrent connections.

## GZIP Compression Status
- **GZIP Enabled**: Yes
- **Verification status**:
  - `/v1/health` (under 1KB threshold): Not compressed (Verified: true)
  - `/v1/exchange-rates?from=USD&to=NGN` (under 1KB threshold): Not compressed (Verified: true)
  - `/v1/transactions` (over 1KB threshold, user1 transactions): Compressed with GZIP (Verified: false)

## Autocannon Results

### 1. Health Endpoint (`/v1/health`)
- **Connections**: 100
- **p50 Latency**: 11 ms
- **p90 Latency**: 14 ms
- **p99 Latency**: 18 ms
- **Average Latency**: 15.33 ms
- **Req/Sec**: 6291.82
- **Throughput**: 7.13 MB/sec
- **Target**: < 20ms p99 (Status: PASSED)

### 2. Exchange Rates Endpoint (`/v1/exchange-rates?from=USD&to=NGN`)
- **Connections**: 100
- **p50 Latency**: 14 ms
- **p90 Latency**: 16 ms
- **p99 Latency**: 28 ms
- **Average Latency**: 14.95 ms
- **Req/Sec**: 6479.46
- **Throughput**: 7.49 MB/sec
- **Target**: < 100ms p99 (Status: PASSED)

### 3. Transactions Endpoint (`/v1/transactions`)
- **Connections**: 100
- **p50 Latency**: 49 ms
- **p90 Latency**: 59 ms
- **p99 Latency**: 91 ms
- **Average Latency**: 51.83 ms
- **Req/Sec**: 1906.55
- **Throughput**: 2.08 MB/sec
- **Target**: < 200ms p99 (Status: PASSED)

## Verification
- Missing indexes created via TypeORM migration.
- N+1 queries resolved.
- Redis caching for expensive aggregates enabled.
