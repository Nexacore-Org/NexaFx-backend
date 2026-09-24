/**
 * Jest E2E Setup File
 * Runs before all E2E tests to configure environment
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/nexafx_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-e2e';
process.env.STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.STRIPE_CARDS_WEBHOOK_SECRET =
  process.env.STRIPE_CARDS_WEBHOOK_SECRET || 'whsec_test_cards';

// Suppress console output during tests (optional)
if (process.env.SUPPRESS_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
}
