// See options.service.spec.ts — the service imports two paths that do not
// exist on disk, so they are stubbed virtually to let the controller load.
jest.mock(
  '../exchange-rates/entities/exchange-rate-snapshot.entity',
  () => ({ ExchangeRateSnapshot: class ExchangeRateSnapshot {} }),
  { virtual: true },
);
jest.mock(
  '../wallets/wallets.service',
  () => ({ WalletsService: class WalletsService {} }),
  { virtual: true },
);

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionsController } from './options.controller';
import { OptionsService } from './options.service';

const REQUEST = { user: { id: 'user-1' } };

const QUOTE_BODY = {
  strikePrice: '1000',
  expiryDate: '2026-02-01',
  contractSize: '100',
};

describe('OptionsController', () => {
  let controller: OptionsController;

  const mockContractRepo = { find: jest.fn() };
  const mockOptionsService = {
    getPremium: jest.fn(),
    createContract: jest.fn(),
    getPnL: jest.fn(),
    // The controller reaches into this private member directly.
    contractRepo: mockContractRepo,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOptionsService.getPremium.mockResolvedValue({
      premium: '50433.78544125',
      annualizedVol: '9.55248659',
      currentRate: '1500.00000000',
      strikePercent: '66.67',
    });
    mockOptionsService.createContract.mockResolvedValue({ id: 'contract-1' });
    mockOptionsService.getPnL.mockResolvedValue({
      totalPnL: '0.00000000',
      contractCount: 0,
      details: [],
    });
    mockContractRepo.find.mockResolvedValue([]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OptionsController],
      providers: [{ provide: OptionsService, useValue: mockOptionsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get<OptionsController>(OptionsController);
  });

  describe('POST /quote', () => {
    it('passes the quote request straight through to the service', async () => {
      const result = await controller.getQuote(QUOTE_BODY);

      expect(mockOptionsService.getPremium).toHaveBeenCalledWith(QUOTE_BODY);
      expect(result.premium).toBe('50433.78544125');
    });

    it('propagates a pricing failure to the caller', async () => {
      mockOptionsService.getPremium.mockRejectedValue(
        new TypeError('currentRate.toFixed is not a function'),
      );

      await expect(controller.getQuote(QUOTE_BODY)).rejects.toThrow(TypeError);
    });
  });

  describe('POST /', () => {
    it('creates the contract for the authenticated user', async () => {
      await controller.create(REQUEST, QUOTE_BODY);

      expect(mockOptionsService.createContract).toHaveBeenCalledWith(
        'user-1',
        QUOTE_BODY,
      );
    });

    it('takes the user id from the request, never from the body', async () => {
      const spoofed = {
        ...QUOTE_BODY,
        userId: 'attacker',
      } as typeof QUOTE_BODY;

      await controller.create(REQUEST, spoofed);

      expect(mockOptionsService.createContract).toHaveBeenCalledWith(
        'user-1',
        spoofed,
      );
    });

    it('propagates an insufficient-balance rejection', async () => {
      mockOptionsService.createContract.mockRejectedValue(
        new BadRequestException('Insufficient balance. Required: 100 XLM'),
      );

      await expect(controller.create(REQUEST, QUOTE_BODY)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('GET /', () => {
    it('lists only the requesting user contracts, newest first', async () => {
      await controller.list(REQUEST);

      expect(mockContractRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
    });

    it('reaches into the service private repository (KNOWN DEFECT — see PR notes)', async () => {
      await controller.list(REQUEST);

      // The controller bypasses the service layer entirely for this route.
      expect(mockContractRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /pnl', () => {
    it('returns the P&L for the authenticated user', async () => {
      await controller.pnl(REQUEST);

      expect(mockOptionsService.getPnL).toHaveBeenCalledWith('user-1');
    });
  });

  describe('routing and access control', () => {
    it('is mounted at options on API version 2', () => {
      expect(Reflect.getMetadata('path', OptionsController)).toBe('options');
      expect(Reflect.getMetadata('__version__', OptionsController)).toBe('2');
    });

    it('requires authentication for every route', () => {
      const guards = (Reflect.getMetadata('__guards__', OptionsController) ??
        []) as unknown[];

      expect(guards).toContain(JwtAuthGuard);
    });
  });
});
