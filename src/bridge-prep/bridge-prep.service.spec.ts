import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BridgePrepService } from './bridge-prep.service';
import { AddressValidationService } from './services/address-validation.service';
import { BlockchainNetwork, AddressFormatType } from './entities/blockchain-network.entity';
import { ExternalWalletAddress } from './entities/external-wallet-address.entity';

describe('BridgePrepService', () => {
  let service: BridgePrepService;
  const networkRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const walletRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const validationService = { validate: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgePrepService,
        { provide: getRepositoryToken(BlockchainNetwork), useValue: networkRepo },
        { provide: getRepositoryToken(ExternalWalletAddress), useValue: walletRepo },
        { provide: AddressValidationService, useValue: validationService },
      ],
    }).compile();

    service = module.get<BridgePrepService>(BridgePrepService);
    jest.clearAllMocks();
  });

  it('returns only active networks', async () => {
    const networks = [{ id: 'stellar', isActive: true } as BlockchainNetwork];
    networkRepo.find.mockResolvedValue(networks);

    await expect(service.getAllNetworks()).resolves.toBe(networks);
    expect(networkRepo.find).toHaveBeenCalledWith({ where: { isActive: true } });
  });

  it('separates active networks into live and coming-soon lists', async () => {
    networkRepo.find.mockResolvedValue([
      { name: 'Stellar', isSupported: true },
      { name: 'Ethereum', isSupported: false },
    ]);

    await expect(service.getBridgeStatus()).resolves.toEqual({
      live: ['Stellar'],
      comingSoon: ['Ethereum'],
    });
  });

  it('validates and saves a wallet for a registered network', async () => {
    const network = { id: 'network-1', addressFormat: AddressFormatType.EVM };
    const wallet = { id: 'wallet-1', userId: 'user-1' };
    networkRepo.findOne.mockResolvedValue(network);
    validationService.validate.mockReturnValue({ valid: true, format: 'EVM' });
    walletRepo.create.mockReturnValue(wallet);
    walletRepo.save.mockResolvedValue(wallet);

    await expect(
      service.saveWallet('user-1', 'network-1', `0x${'a'.repeat(40)}`, 'Main'),
    ).resolves.toBe(wallet);
    expect(walletRepo.create).toHaveBeenCalledWith({
      userId: 'user-1',
      networkId: 'network-1',
      address: `0x${'a'.repeat(40)}`,
      label: 'Main',
      isVerified: false,
    });
  });

  it('rejects a malformed wallet address before saving', async () => {
    networkRepo.findOne.mockResolvedValue({ addressFormat: AddressFormatType.STELLAR });
    validationService.validate.mockReturnValue({
      valid: false,
      format: 'STELLAR',
      error: 'Invalid Stellar public address pattern',
    });

    await expect(service.saveWallet('user-1', 'network-1', 'bad')).rejects.toThrow(
      new BadRequestException('Invalid Stellar public address pattern'),
    );
    expect(walletRepo.create).not.toHaveBeenCalled();
    expect(walletRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an unregistered network before address validation', async () => {
    networkRepo.findOne.mockResolvedValue(null);

    await expect(service.saveWallet('user-1', 'missing', 'address')).rejects.toThrow(
      new NotFoundException('Target blockchain network profile missing'),
    );
    expect(validationService.validate).not.toHaveBeenCalled();
  });

  it('currently passes duplicate wallet registrations to the repository', async () => {
    const network = { id: 'network-1', addressFormat: AddressFormatType.EVM };
    networkRepo.findOne.mockResolvedValue(network);
    validationService.validate.mockReturnValue({ valid: true, format: 'EVM' });
    walletRepo.create.mockImplementation((value) => value);
    walletRepo.save.mockImplementation(async (value) => value);

    await service.saveWallet('user-1', 'network-1', `0x${'b'.repeat(40)}`);
    await service.saveWallet('user-1', 'network-1', `0x${'b'.repeat(40)}`);

    expect(walletRepo.save).toHaveBeenCalledTimes(2);
  });

  it('limits wallet reads and removal to the authenticated user', async () => {
    const wallets = [{ id: 'wallet-1' }];
    walletRepo.find.mockResolvedValue(wallets);
    walletRepo.findOne.mockResolvedValue(wallets[0]);

    await expect(service.getUserWallets('user-1')).resolves.toBe(wallets);
    await expect(service.removeWallet('wallet-1', 'user-1')).resolves.toBeUndefined();
    expect(walletRepo.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      relations: ['network'],
    });
    expect(walletRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'wallet-1', userId: 'user-1' },
    });
    expect(walletRepo.remove).toHaveBeenCalledWith(wallets[0]);
  });

  it('rejects removing or verifying a wallet outside the user scope', async () => {
    walletRepo.findOne.mockResolvedValue(null);

    await expect(service.removeWallet('wallet-1', 'user-1')).rejects.toThrow(NotFoundException);
    await expect(service.initiateVerification('wallet-1', 'user-1')).rejects.toThrow(
      new NotFoundException('Target wallet profile unassigned'),
    );
  });

  it('generates a verification challenge for an owned wallet', async () => {
    walletRepo.findOne.mockResolvedValue({ id: 'wallet-1' });

    await expect(service.initiateVerification('wallet-1', 'user-1')).resolves.toEqual({
      id: 'wallet-1',
      verificationStatus: 'CHALLENGE_GENERATED',
      challenge: 'Sign this state update footprint',
    });
  });
});