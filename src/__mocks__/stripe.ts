/**
 * Manual Jest mock for the `stripe` npm package.
 *
 * Stripe is not installed in this project's node_modules. This file lives at
 * `src/__mocks__/stripe.ts` so Jest (rootDir=src) resolves it automatically
 * when a test calls `jest.mock('stripe')`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockStripeInstance = {
  issuing: {
    cardholders: { create: jest.fn() },
    cards: { create: jest.fn(), update: jest.fn() },
    authorizations: { approve: jest.fn(), decline: jest.fn() },
  },
  ephemeralKeys: { create: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
};

const Stripe = jest.fn(() => mockStripeInstance) as jest.Mock & {
  __instance: typeof mockStripeInstance;
};
Stripe.__instance = mockStripeInstance;

export default Stripe;
