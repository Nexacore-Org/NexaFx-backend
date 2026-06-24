export const mockStellarService = () => ({
  getWalletBalances: jest.fn().mockResolvedValue({
    balances: [
      {
        balance: '1000.0000000',
        asset_type: 'native',
      },
    ],
  }),
  submitPayment: jest.fn().mockResolvedValue({
    hash: 'abc123def456',
    status: 'success',
  }),
  validateDestination: jest.fn().mockResolvedValue(true),
  getAccountDetails: jest.fn().mockResolvedValue({
    id: 'GTEST123',
    balances: [],
  }),
});

export default mockStellarService;
