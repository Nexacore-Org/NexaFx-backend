/**
 * Shared mock for the `stripe` external boundary.
 *
 * The cards domain talks to Stripe Issuing over the network. E2E tests must not
 * make real external calls, so this mock is registered globally in
 * `test/helpers/app.helper.ts` (next to the Firebase / Mailgun / Stellar mocks)
 * and exposes resettable jest mock functions that individual specs can override.
 */

const cardholderCreate = jest.fn();
const cardCreate = jest.fn();
const cardUpdate = jest.fn();
const authorizationApprove = jest.fn();
const authorizationDecline = jest.fn();
const ephemeralKeyCreate = jest.fn();
const constructEvent = jest.fn();

export const mockStripe = {
  issuing: {
    cardholders: { create: cardholderCreate },
    cards: { create: cardCreate, update: cardUpdate },
    authorizations: {
      approve: authorizationApprove,
      decline: authorizationDecline,
    },
  },
  ephemeralKeys: { create: ephemeralKeyCreate },
  webhooks: { constructEvent },
};

/**
 * Restore the deterministic happy-path behaviour used by the cards E2E suite.
 * Call this from `beforeEach` so per-test overrides never leak between tests.
 */
export function resetStripeMock(): void {
  cardholderCreate.mockReset().mockResolvedValue({ id: 'ich_test_cardholder' });
  cardCreate.mockReset().mockResolvedValue({
    id: 'ic_test_card',
    last4: '4242',
    exp_month: 12,
    exp_year: 2030,
    brand: 'Visa',
  });
  cardUpdate.mockReset().mockResolvedValue({ id: 'ic_test_card' });
  authorizationApprove.mockReset().mockResolvedValue({});
  authorizationDecline.mockReset().mockResolvedValue({});
  ephemeralKeyCreate
    .mockReset()
    .mockResolvedValue({ secret: 'ek_test_ephemeral_secret' });
  constructEvent.mockReset().mockImplementation((body?: Buffer) => {
    const raw = body ? body.toString() : '{}';
    return JSON.parse(raw);
  });
}

resetStripeMock();

const MockStripe: any = jest.fn(() => mockStripe);
MockStripe.Stripe = MockStripe;

export default MockStripe;
