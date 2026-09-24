#!/usr/bin/env bash
cd "c:/Users/a-abdulkareem/Documents/SISTER/NexaFx-backend" || exit 1
export NODE_ENV=test
export DATABASE_URL="postgresql://postgres@localhost:5433/nexafx_test"
export REDIS_URL="redis://localhost:6379"
export JWT_SECRET="test-secret-for-e2e"
export JWT_EXPIRES_IN="15m"
export WALLET_ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000"
export THROTTLE_AUTH_LIMIT="1000"
export SKIP_EMAIL_SENDING="true"
export OTP_SECRET="test-otp-secret"
export MAILGUN_API_KEY="test"
export MAILGUN_DOMAIN="test.example.com"
npx jest --config ./test/jest-e2e.json --runTestsByPath "$1" --forceExit 2>&1 | tail -150
