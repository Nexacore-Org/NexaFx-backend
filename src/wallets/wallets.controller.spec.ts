import { Test, TestingModule } from '@nestjs/testing';
import { WalletsController } from './wallets.controller';

// Manual mock prevents ts-jest from transpiling the real wallets.service.ts,
// which avoids broken dead-code in its transitive dependency chain.
jest.mock('./wallets.service', () => ({
  WalletsService: jest.fn(),
}));

describe('WalletsController', () => {
  let controller: WalletsController;

  const mockService = {
    generateWallet: jest.fn(),
    importWatchOnly: jest.fn(),
    listWallets: jest.fn(),
    findByUserAndCurrency: jest.fn(),
    updateLabel: jest.fn(),
    setDefault: jest.fn(),
    deleteWallet: jest.fn(),
  };

  const req = { user: { userId: 'user-1' } };

  const makeSummary = (id: string) => ({
    id,
    publicKey: 'GKEY',
    label: 'Primary',
    isDefault: false,
    isWatchOnly: false,
    network: 'TESTNET',
    createdAt: new Date(),
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-assign mock methods after clearAllMocks
    const mod = await import('./wallets.service');
    Object.assign(mod.WalletsService.prototype, mockService);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [{ provide: mod.WalletsService, useValue: mockService }],
    }).compile();

    controller = module.get<WalletsController>(WalletsController);
  });

  describe('generate', () => {
    it('should call service.generateWallet with userId and dto', async () => {
      const summary = makeSummary('new-wallet');
      mockService.generateWallet.mockResolvedValue(summary);

      const result = await controller.generate(req, { label: 'Trading' });

      expect(mockService.generateWallet).toHaveBeenCalledWith('user-1', {
        label: 'Trading',
      });
      expect(result).toEqual(summary);
    });
  });

  describe('import', () => {
    it('should call service.importWatchOnly with userId and dto', async () => {
      const summary = makeSummary('imported-wallet');
      mockService.importWatchOnly.mockResolvedValue(summary);

      const result = await controller.import(req, {
        publicKey: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
      });

      expect(mockService.importWatchOnly).toHaveBeenCalledWith('user-1', {
        publicKey: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
      });
      expect(result).toEqual(summary);
    });
  });

  describe('list', () => {
    it('should return paginated wallets', async () => {
      mockService.listWallets.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      const result = await controller.list(req);

      expect(mockService.listWallets).toHaveBeenCalledWith('user-1');
      expect(result.total).toBe(0);
    });
  });

  describe('getByCurrency', () => {
    it('should delegate to findByUserAndCurrency', async () => {
      const wallet = { id: 'w1', currency: 'XLM' };
      mockService.findByUserAndCurrency.mockResolvedValue(wallet);

      const result = await controller.getByCurrency(req, 'XLM');

      expect(mockService.findByUserAndCurrency).toHaveBeenCalledWith(
        'user-1',
        'XLM',
      );
      expect(result).toEqual(wallet);
    });
  });

  describe('updateLabel', () => {
    it('should call service.updateLabel', async () => {
      mockService.updateLabel.mockResolvedValue(makeSummary('w1'));

      await controller.updateLabel(req, 'w1', {
        label: 'Savings',
      });

      expect(mockService.updateLabel).toHaveBeenCalledWith(
        'user-1',
        'w1',
        'Savings',
      );
    });
  });

  describe('setDefault', () => {
    it('should call service.setDefault and return success message', async () => {
      mockService.setDefault.mockResolvedValue(undefined);

      const result = await controller.setDefault(req, 'wallet-2');

      expect(mockService.setDefault).toHaveBeenCalledWith('user-1', 'wallet-2');
      expect(result).toEqual({ message: 'Default wallet updated' });
    });
  });

  describe('remove', () => {
    it('should call service.deleteWallet and return success message', async () => {
      mockService.deleteWallet.mockResolvedValue(undefined);

      const result = await controller.remove(req, 'wallet-2');

      expect(mockService.deleteWallet).toHaveBeenCalledWith(
        'user-1',
        'wallet-2',
      );
      expect(result).toEqual({ message: 'Wallet removed' });
    });
  });
});
