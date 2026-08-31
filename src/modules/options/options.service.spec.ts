// options.service.ts imports two paths that do not exist on disk:
//   '../exchange-rates/entities/exchange-rate-snapshot.entity'  -> real file is src/exchange-rates/...
//   '../wallets/wallets.service'                                -> real file is src/wallets/...
// They are stubbed virtually so the module's real business logic can be
// exercised without altering production source. See options.module.spec.ts,
// which pins this defect, and the PR notes.
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

import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThanOrEqual } from 'typeorm';
import Decimal from 'decimal.js';
import { OptionsService } from './options.service';
import {
  OptionContract,
  OptionStatus,
  OptionType,
} from './entities/option-contract.entity';

const { ExchangeRateSnapshot }: { ExchangeRateSnapshot: new () => object } =
  jest.requireMock('../exchange-rates/entities/exchange-rate-snapshot.entity');

const { WalletsService }: { WalletsService: new () => object } =
  jest.requireMock('../wallets/wallets.service');

/** The NGN amount handed to the first walletsService.credit() call. */
function creditedAmount(credit: jest.Mock): string {
  const calls = credit.mock.calls as unknown as string[][];
  return calls[0][2];
}

/** Frozen so time-to-expiry, and therefore the premium, is deterministic. */
const NOW = new Date('2026-01-01T00:00:00Z');

/**
 * Compares two monetary strings by decimal value rather than by float
 * equality, per the repo's Decimal.js constraint.
 */
function expectMoneyEqual(actual: string, expected: string): void {
  expect(new Decimal(actual).toFixed(8)).toBe(new Decimal(expected).toFixed(8));
}

function contract(overrides: Partial<OptionContract> = {}): OptionContract {
  return {
    id: 'contract-1',
    userId: 'user-1',
    type: OptionType.CALL,
    underlyingCurrency: 'XLM',
    settlementCurrency: 'NGN',
    strikePrice: '1500.00000000',
    expiryDate: '2025-12-31',
    contractSize: '100.00000000',
    premium: '10.00000000',
    status: OptionStatus.ACTIVE,
    exercisedAt: null,
    createdAt: new Date('2025-06-01T00:00:00Z'),
    updatedAt: new Date('2025-06-01T00:00:00Z'),
    ...overrides,
  };
}

describe('OptionsService', () => {
  let service: OptionsService;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const mockContractRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const mockRateRepo = { findOne: jest.fn(), find: jest.fn() };
  const mockWalletsService = {
    getBalance: jest.fn(),
    lockBalance: jest.fn(),
    unlockBalance: jest.fn(),
    credit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: no history, so computeVolatility() falls back to 0.5.
    mockRateRepo.find.mockResolvedValue([]);
    mockRateRepo.findOne.mockResolvedValue({ rate: 1500 });
    mockContractRepo.find.mockResolvedValue([]);
    mockContractRepo.create.mockImplementation(
      (input: Partial<OptionContract>) => input,
    );
    mockContractRepo.save.mockImplementation((input: Partial<OptionContract>) =>
      Promise.resolve(input),
    );
    mockWalletsService.getBalance.mockResolvedValue('1000');
    mockWalletsService.lockBalance.mockResolvedValue(undefined);
    mockWalletsService.unlockBalance.mockResolvedValue(undefined);
    mockWalletsService.credit.mockResolvedValue(undefined);

    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OptionsService,
        {
          provide: getRepositoryToken(OptionContract),
          useValue: mockContractRepo,
        },
        {
          provide: getRepositoryToken(ExchangeRateSnapshot),
          useValue: mockRateRepo,
        },
        { provide: WalletsService, useValue: mockWalletsService },
      ],
    }).compile();

    service = moduleRef.get<OptionsService>(OptionsService);
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const quote = {
    strikePrice: '1000',
    expiryDate: '2026-02-01',
    contractSize: '100',
  };

  describe('getPremium', () => {
    it('throws because getCurrentRate returns a string (KNOWN DEFECT — see PR notes)', async () => {
      // ExchangeRateSnapshot.rate is declared `string`, which is what TypeORM
      // returns for a numeric column, so this is the production path.
      mockRateRepo.findOne.mockResolvedValue({ rate: '1500' });

      await expect(service.getPremium(quote)).rejects.toThrow(
        /toFixed is not a function/,
      );
    });

    it('prices an in-the-money call when the rate is numeric', async () => {
      const result = await service.getPremium(quote);

      expectMoneyEqual(result.premium, '50433.78544125');
      expectMoneyEqual(String(result.currentRate), '1500.00000000');
      expect(result.strikePercent).toBe('66.67');
    });

    it('annualizes the fallback volatility of 0.5 over 365 days', async () => {
      const result = await service.getPremium(quote);

      expect(result.annualizedVol).toBe('9.55248659');
    });

    it('falls back to 0.5 volatility when fewer than two snapshots exist', async () => {
      mockRateRepo.find.mockResolvedValue([{ rate: '1500' }]);

      const result = await service.getPremium(quote);

      expect(result.annualizedVol).toBe('9.55248659');
    });

    it('computes volatility from log returns when history is available', async () => {
      mockRateRepo.find.mockResolvedValue([
        { rate: '1400' },
        { rate: '1500' },
        { rate: '1450' },
        { rate: '1600' },
      ]);

      const result = await service.getPremium(quote);

      // Any real computed volatility differs from the 0.5 fallback.
      expect(result.annualizedVol).not.toBe('9.55248659');
      expect(Number(result.annualizedVol)).toBeGreaterThan(0);
    });

    it('ignores non-positive rates when building log returns', async () => {
      mockRateRepo.find.mockResolvedValue([
        { rate: '0' },
        { rate: '0' },
        { rate: '0' },
      ]);

      const result = await service.getPremium(quote);

      // Every pair is filtered out, so the fallback applies.
      expect(result.annualizedVol).toBe('9.55248659');
    });

    it('floors a deep out-of-the-money premium at zero', async () => {
      const result = await service.getPremium({
        ...quote,
        strikePrice: '1000000000',
      });

      expectMoneyEqual(result.premium, '0');
      expect(result.premium).toBe('0.00000000');
    });

    it('prices an already-expired contract higher than a live one (KNOWN DEFECT — see PR notes)', async () => {
      // timeToExpiryYears is 0, but `Math.sqrt(t || 1)` substitutes a full
      // year of volatility, so a worthless contract quotes a larger premium.
      const expired = await service.getPremium({
        ...quote,
        expiryDate: '2025-01-01',
      });
      const live = await service.getPremium(quote);

      expectMoneyEqual(expired.premium, '58440.80780240');
      expect(new Decimal(expired.premium).greaterThan(live.premium)).toBe(true);
    });

    it('also throws when no rate snapshot exists at all (KNOWN DEFECT — see PR notes)', async () => {
      mockRateRepo.findOne.mockResolvedValue(null);

      // getCurrentRate() falls back to the string '0', which hits the same
      // .toFixed defect, so a missing snapshot cannot produce a quote either.
      await expect(service.getPremium(quote)).rejects.toThrow(
        /toFixed is not a function/,
      );
    });

    it('divides by zero when the latest rate is zero (KNOWN DEFECT — see PR notes)', async () => {
      mockRateRepo.findOne.mockResolvedValue({ rate: 0 });

      const result = await service.getPremium({
        ...quote,
        strikePrice: '1500',
      });

      expect(result.strikePercent).toBe('Infinity');
      expect(result.premium).toBe('0.00000000');
    });

    it('emits NaN rather than rejecting a non-numeric strike price (KNOWN DEFECT — see PR notes)', async () => {
      const result = await service.getPremium({
        ...quote,
        strikePrice: 'not-a-number',
      });

      expect(result.premium).toBe('NaN');
      expect(result.strikePercent).toBe('NaN');
    });
  });

  describe('createContract', () => {
    it('cannot complete in production because the premium quote throws', async () => {
      mockRateRepo.findOne.mockResolvedValue({ rate: '1500' });

      await expect(service.createContract('user-1', quote)).rejects.toThrow(
        /toFixed is not a function/,
      );

      // Fails before any wallet or persistence side effect.
      expect(mockWalletsService.lockBalance).not.toHaveBeenCalled();
      expect(mockContractRepo.save).not.toHaveBeenCalled();
    });

    it('rejects when the balance is below the contract size', async () => {
      mockWalletsService.getBalance.mockResolvedValue('99');

      await expect(service.createContract('user-1', quote)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createContract('user-1', quote)).rejects.toThrow(
        'Insufficient balance. Required: 100 XLM',
      );
    });

    it('does not lock or persist anything when the balance is short', async () => {
      mockWalletsService.getBalance.mockResolvedValue('99');

      await expect(service.createContract('user-1', quote)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockWalletsService.lockBalance).not.toHaveBeenCalled();
      expect(mockContractRepo.create).not.toHaveBeenCalled();
      expect(mockContractRepo.save).not.toHaveBeenCalled();
    });

    it('accepts a balance exactly equal to the contract size', async () => {
      mockWalletsService.getBalance.mockResolvedValue('100');

      await expect(
        service.createContract('user-1', quote),
      ).resolves.toBeDefined();
    });

    it('checks the balance in XLM for the requesting user', async () => {
      await service.createContract('user-1', quote);

      expect(mockWalletsService.getBalance).toHaveBeenCalledWith(
        'user-1',
        'XLM',
      );
    });

    it('locks the contract size before persisting', async () => {
      await service.createContract('user-1', quote);

      expect(mockWalletsService.lockBalance).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        '100',
      );
    });

    it('persists an active CALL on the hardcoded XLM/NGN pair with the quoted premium', async () => {
      await service.createContract('user-1', quote);

      expect(mockContractRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: OptionType.CALL,
        underlyingCurrency: 'XLM',
        settlementCurrency: 'NGN',
        strikePrice: '1000',
        expiryDate: '2026-02-01',
        contractSize: '100',
        premium: '50433.78544125',
        status: OptionStatus.ACTIVE,
      });
      expect(mockContractRepo.save).toHaveBeenCalledTimes(1);
    });

    it('returns the saved contract', async () => {
      const saved = contract({ id: 'contract-9' });
      mockContractRepo.save.mockResolvedValue(saved);

      await expect(service.createContract('user-1', quote)).resolves.toBe(
        saved,
      );
    });

    it('never debits the quoted premium (KNOWN DEFECT — see PR notes)', async () => {
      await service.createContract('user-1', quote);

      // A premium of 50433.79 NGN is quoted and stored, but only the XLM
      // contract size is locked; nothing collects the premium.
      expect(mockWalletsService.credit).not.toHaveBeenCalled();
      expect(mockWalletsService.lockBalance).toHaveBeenCalledTimes(1);
      expect(mockWalletsService.lockBalance).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        '100',
      );
    });

    describe('missing input validation (KNOWN DEFECT — see PR notes)', () => {
      it('accepts a negative strike price', async () => {
        await expect(
          service.createContract('user-1', { ...quote, strikePrice: '-500' }),
        ).resolves.toBeDefined();
      });

      it('accepts an expiry date already in the past', async () => {
        await expect(
          service.createContract('user-1', {
            ...quote,
            expiryDate: '2020-01-01',
          }),
        ).resolves.toBeDefined();
      });

      it('accepts a zero contract size', async () => {
        mockWalletsService.getBalance.mockResolvedValue('0');

        await expect(
          service.createContract('user-1', { ...quote, contractSize: '0' }),
        ).resolves.toBeDefined();
      });

      it('persists a NaN premium for a non-numeric strike price', async () => {
        await service.createContract('user-1', {
          ...quote,
          strikePrice: 'not-a-number',
        });

        expect(mockContractRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ premium: 'NaN' }),
        );
      });

      it('never validates the currency pair because it is hardcoded', async () => {
        await service.createContract('user-1', quote);

        expect(mockContractRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            underlyingCurrency: 'XLM',
            settlementCurrency: 'NGN',
            type: OptionType.CALL,
          }),
        );
      });
    });
  });

  describe('settleExpiry', () => {
    it('selects only active contracts expiring on or before today', async () => {
      await service.settleExpiry();

      expect(mockContractRepo.find).toHaveBeenCalledWith({
        where: {
          status: OptionStatus.ACTIVE,
          expiryDate: LessThanOrEqual('2026-01-01'),
        },
      });
    });

    it('does nothing when no contracts have expired', async () => {
      await service.settleExpiry();

      expect(mockWalletsService.unlockBalance).not.toHaveBeenCalled();
      expect(mockContractRepo.save).not.toHaveBeenCalled();
    });

    it('exercises a contract that is in the money', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({ strikePrice: '1000', contractSize: '10' }),
      ]);
      mockRateRepo.findOne.mockResolvedValue({ rate: '1500' });

      await service.settleExpiry();

      expect(mockContractRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OptionStatus.EXERCISED }),
      );
    });

    it('exercises an at-the-money contract, treating equality as in the money', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({ strikePrice: '1500', contractSize: '10' }),
      ]);
      mockRateRepo.findOne.mockResolvedValue({ rate: '1500' });

      await service.settleExpiry();

      expect(mockContractRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OptionStatus.EXERCISED }),
      );
      // Payout is exactly zero, so nothing is credited.
      expect(mockWalletsService.credit).not.toHaveBeenCalled();
    });

    it('expires a contract that is out of the money', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({ strikePrice: '2000', contractSize: '10' }),
      ]);
      mockRateRepo.findOne.mockResolvedValue({ rate: '1500' });

      await service.settleExpiry();

      expect(mockContractRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OptionStatus.EXPIRED }),
      );
      expect(mockWalletsService.credit).not.toHaveBeenCalled();
    });

    it('settles a mixed batch independently', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({ id: 'itm', strikePrice: '1000', contractSize: '10' }),
        contract({ id: 'otm', strikePrice: '2000', contractSize: '10' }),
      ]);
      mockRateRepo.findOne.mockResolvedValue({ rate: '1500' });

      await service.settleExpiry();

      const statuses = mockContractRepo.save.mock.calls.map(
        (call: [OptionContract]) => call[0].status,
      );
      expect(statuses).toEqual([OptionStatus.EXERCISED, OptionStatus.EXPIRED]);
    });

    it('re-reads the rate for each contract in the batch', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({ id: 'a' }),
        contract({ id: 'b' }),
      ]);

      await service.settleExpiry();

      expect(mockRateRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('continues settling the batch after one contract fails', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({ id: 'boom', strikePrice: '1000', contractSize: '10' }),
        contract({ id: 'ok', strikePrice: '1000', contractSize: '10' }),
      ]);
      mockRateRepo.findOne.mockResolvedValue({ rate: '1500' });
      mockWalletsService.unlockBalance
        .mockRejectedValueOnce(new Error('wallet locked'))
        .mockResolvedValue(undefined);

      await service.settleExpiry();

      expect(mockWalletsService.unlockBalance).toHaveBeenCalledTimes(2);
      expect(mockContractRepo.save).toHaveBeenCalledTimes(1);
    });

    it('logs the contract id and reason when settlement fails', async () => {
      mockContractRepo.find.mockResolvedValue([contract({ id: 'boom' })]);
      mockRateRepo.findOne.mockResolvedValue({ rate: '1500' });
      mockWalletsService.unlockBalance.mockRejectedValue(
        new Error('wallet locked'),
      );

      await service.settleExpiry();

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to settle contract boom: wallet locked',
      );
    });

    it('does not abort the run when the rate lookup itself fails', async () => {
      mockContractRepo.find.mockResolvedValue([contract({ id: 'boom' })]);
      mockRateRepo.findOne.mockRejectedValue(new Error('db down'));

      await expect(service.settleExpiry()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to settle contract boom: db down',
      );
    });
  });

  describe('exerciseContract', () => {
    it('unlocks the underlying, credits the payout and marks the contract exercised', async () => {
      const target = contract({ strikePrice: '1000', contractSize: '10' });

      await service.exerciseContract(target, '1500');

      expect(mockWalletsService.unlockBalance).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        '10',
      );
      expect(mockWalletsService.credit).toHaveBeenCalledWith(
        'user-1',
        'NGN',
        '5000.00000000',
      );
      expect(target.status).toBe(OptionStatus.EXERCISED);
      expect(target.exercisedAt).toEqual(NOW);
      expect(mockContractRepo.save).toHaveBeenCalledWith(target);
    });

    it('computes the payout as (rate - strike) x size', async () => {
      const target = contract({ strikePrice: '1200.5', contractSize: '4' });

      await service.exerciseContract(target, '1300.75');

      const credited = creditedAmount(mockWalletsService.credit);
      expectMoneyEqual(
        credited,
        new Decimal('1300.75').minus('1200.5').times('4').toFixed(8),
      );
    });

    it('still unlocks but does not credit when the payout is exactly zero', async () => {
      const target = contract({ strikePrice: '1500', contractSize: '10' });

      await service.exerciseContract(target, '1500');

      expect(mockWalletsService.unlockBalance).toHaveBeenCalledTimes(1);
      expect(mockWalletsService.credit).not.toHaveBeenCalled();
      expect(target.status).toBe(OptionStatus.EXERCISED);
    });

    it('does not credit a negative payout', async () => {
      const target = contract({ strikePrice: '2000', contractSize: '10' });

      await service.exerciseContract(target, '1500');

      expect(mockWalletsService.credit).not.toHaveBeenCalled();
      expect(target.status).toBe(OptionStatus.EXERCISED);
    });

    it('logs the payout on exercise', async () => {
      const target = contract({ strikePrice: '1000', contractSize: '10' });

      await service.exerciseContract(target, '1500');

      expect(logSpy).toHaveBeenCalledWith(
        'Contract contract-1 exercised. Payout: 5000.00 NGN',
      );
    });

    it('overpays the payout because the math is raw floating point (KNOWN DEFECT — see PR notes)', async () => {
      const target = contract({
        strikePrice: '1500.1',
        contractSize: '100000000',
      });

      await service.exerciseContract(target, '1500.3');

      const credited = creditedAmount(mockWalletsService.credit);
      const exact = new Decimal('1500.3')
        .minus('1500.1')
        .times('100000000')
        .toFixed(8);

      expect(credited).toBe('20000000.00000455');
      expect(exact).toBe('20000000.00000000');
      // The credited amount exceeds the true value by 0.00000455 NGN.
      expect(new Decimal(credited).greaterThan(exact)).toBe(true);
    });
  });

  describe('expireContract', () => {
    it('transitions an expired, unexercised contract to EXPIRED', async () => {
      const target = contract({ status: OptionStatus.ACTIVE });

      await service.expireContract(target);

      expect(target.status).toBe(OptionStatus.EXPIRED);
    });

    it('releases the locked underlying', async () => {
      const target = contract({ contractSize: '250.5' });

      await service.expireContract(target);

      expect(mockWalletsService.unlockBalance).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        '250.5',
      );
    });

    it('never credits a settlement payout', async () => {
      await service.expireContract(contract());

      expect(mockWalletsService.credit).not.toHaveBeenCalled();
    });

    it('leaves exercisedAt unset', async () => {
      const target = contract();

      await service.expireContract(target);

      expect(target.exercisedAt).toBeNull();
    });

    it('persists the terminal state', async () => {
      const target = contract();

      await service.expireContract(target);

      expect(mockContractRepo.save).toHaveBeenCalledWith(target);
      expect(logSpy).toHaveBeenCalledWith(
        'Contract contract-1 expired (out of the money)',
      );
    });
  });

  describe('getPnL', () => {
    it('queries the user contracts newest first', async () => {
      await service.getPnL('user-1');

      expect(mockContractRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
    });

    it('returns a zero result when there is nothing settled', async () => {
      const result = await service.getPnL('user-1');

      expect(result).toEqual({
        totalPnL: '0.00000000',
        contractCount: 0,
        details: [],
      });
    });

    it('excludes contracts that are still active', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({ id: 'active', status: OptionStatus.ACTIVE }),
      ]);

      const result = await service.getPnL('user-1');

      expect(result.contractCount).toBe(0);
      expect(result.details).toEqual([]);
    });

    it('books an expired contract as a loss of the premium', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({ status: OptionStatus.EXPIRED, premium: '25.5' }),
      ]);

      const result = await service.getPnL('user-1');

      expectMoneyEqual(result.details[0].pnl, '-25.5');
      expectMoneyEqual(result.totalPnL, '-25.5');
      expect(result.contractCount).toBe(1);
    });

    it('values an exercised contract off the strike price, not the exercise rate (KNOWN DEFECT — see PR notes)', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({
          status: OptionStatus.EXERCISED,
          strikePrice: '1500',
          contractSize: '10',
          premium: '100',
          exercisedAt: new Date('2025-12-31T00:00:00Z'),
        }),
      ]);

      const result = await service.getPnL('user-1');

      // strike x size - premium = notional minus premium, not profit.
      expectMoneyEqual(result.details[0].pnl, '14900');
    });

    it('treats an exercised contract with no exercisedAt as a premium loss', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({
          status: OptionStatus.EXERCISED,
          exercisedAt: null,
          premium: '40',
        }),
      ]);

      const result = await service.getPnL('user-1');

      expectMoneyEqual(result.details[0].pnl, '-40');
    });

    it('reports each settled contract in the details payload', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({ id: 'a', status: OptionStatus.EXPIRED, premium: '10' }),
        contract({ id: 'b', status: OptionStatus.EXPIRED, premium: '20' }),
      ]);

      const result = await service.getPnL('user-1');

      expect(result.contractCount).toBe(2);
      expect(result.details.map((d) => d.id)).toEqual(['a', 'b']);
      expectMoneyEqual(result.totalPnL, '-30');
    });

    it('loses a settled amount when totalling in floating point (KNOWN DEFECT — see PR notes)', async () => {
      mockContractRepo.find.mockResolvedValue([
        contract({
          id: 'large',
          status: OptionStatus.EXERCISED,
          strikePrice: '100000',
          contractSize: '100000',
          premium: '0',
          exercisedAt: new Date('2025-12-31T00:00:00Z'),
        }),
        contract({
          id: 'tiny',
          status: OptionStatus.EXPIRED,
          premium: '0.00000001',
        }),
      ]);

      const result = await service.getPnL('user-1');

      const exact = new Decimal('100000')
        .times('100000')
        .minus('0')
        .minus('0.00000001')
        .toFixed(8);

      expect(result.totalPnL).toBe('10000000000.00000000');
      expect(exact).toBe('9999999999.99999999');
      // The 0.00000001 loss is silently discarded by float addition.
      expect(new Decimal(result.totalPnL).greaterThan(exact)).toBe(true);
    });
  });

  describe('monetary arithmetic', () => {
    it('performs settlement in raw floating point, not Decimal.js (KNOWN DEFECT — see PR notes)', () => {
      const source = readFileSync(
        join(__dirname, 'options.service.ts'),
        'utf8',
      );

      // Remove this test once the module is migrated to Decimal.js.
      expect(source).not.toContain('decimal.js');
      expect(source).toContain('Number(currentRate)');
      expect(source).toContain('Number(contract.strikePrice)');
    });
  });
});
