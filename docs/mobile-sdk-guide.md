# NexaFx Mobile SDK Integration Guide

## 1. Overview
The Mobile SDK Guide module provides core configuration metadata, version verification, and a reference client architecture for the NexaFx React Native mobile app.

## 2. Authentication Flow
- **JWT Authentication**: Mobile clients authenticate requests by passing a Bearer token in the `Authorization` header.
- **Token Refresh**: When a `401 Unauthorized` response is received, the client must call `/v2/auth/refresh` using the stored refresh token to obtain a new access token.

## 3. Idempotency Keys
All financial transactions (deposits, withdrawals, swaps) require an `Idempotency-Key` header (UUID v4) to prevent duplicate processing on network retries.

## 4. WebSocket Gateway
Connect to the real-time exchange rate feed via:
`wss://ws.nexafx.com/v2/rates`
- Send subscription frame: `{"event": "subscribe", "channels": ["rates:fx"]}`

## 5. Error Code Reference
- `ERR_VERSION_OUTDATED`: Client version is lower than `minSupportedVersion`. Update required.
- `ERR_INVALID_IDEMPOTENCY`: Missing or re-used idempotency key on financial operations.