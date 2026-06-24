export const mockExchangeRatesService = () => ({
  getRate: jest.fn().mockResolvedValue({ rate: '1.5' }),
  convertToUsd: jest.fn().mockResolvedValue(100),
  convertFromUsd: jest.fn().mockResolvedValue(66.67),
  getRates: jest.fn().mockResolvedValue({ USD: 1, EUR: 0.92 }),
  updateRates: jest.fn().mockResolvedValue({ success: true }),
});

export default mockExchangeRatesService;
