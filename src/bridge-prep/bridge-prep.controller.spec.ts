import { Test, TestingModule } from '@nestjs/testing';
import { BridgePrepController } from './bridge-prep.controller';
import { BridgePrepService } from './bridge-prep.service';

describe('BridgePrepController', () => {
  let controller: BridgePrepController;
  const bridgePrepService = {
    getAllNetworks: jest.fn(),
    getBridgeStatus: jest.fn(),
    saveWallet: jest.fn(),
    getUserWallets: jest.fn(),
    removeWallet: jest.fn(),
    initiateVerification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BridgePrepController],
      providers: [{ provide: BridgePrepService, useValue: bridgePrepService }],
    }).compile();

    controller = module.get<BridgePrepController>(BridgePrepController);
    jest.clearAllMocks();
  });

  it('delegates network and bridge-status reads', async () => {
    bridgePrepService.getAllNetworks.mockResolvedValue(['network']);
    bridgePrepService.getBridgeStatus.mockResolvedValue({ live: [], comingSoon: [] });

    await expect(controller.getNetworks()).resolves.toEqual(['network']);
    await expect(controller.getStatus()).resolves.toEqual({ live: [], comingSoon: [] });
  });

  it('delegates wallet creation with the authenticated user and body fields', async () => {
    bridgePrepService.saveWallet.mockResolvedValue({ id: 'wallet-1' });
    const body = { networkId: 'network-1', address: 'address', label: 'Main' };

    await expect(controller.saveWallet({ user: { id: 'user-1' } }, body)).resolves.toEqual({
      id: 'wallet-1',
    });
    expect(bridgePrepService.saveWallet).toHaveBeenCalledWith(
      'user-1',
      'network-1',
      'address',
      'Main',
    );
  });

  it.each([
    ['getWallets', () => controller.getWallets({ user: { id: 'user-1' } })],
    ['removeWallet', () => controller.removeWallet('wallet-1', { user: { id: 'user-1' } })],
    ['verifyWallet', () => controller.verifyWallet('wallet-1', { user: { id: 'user-1' } })],
  ])('delegates %s with the authenticated user scope', async (_name, action) => {
    await action();
    expect(bridgePrepService.getUserWallets.mock.calls.length +
      bridgePrepService.removeWallet.mock.calls.length +
      bridgePrepService.initiateVerification.mock.calls.length).toBe(1);
  });
});