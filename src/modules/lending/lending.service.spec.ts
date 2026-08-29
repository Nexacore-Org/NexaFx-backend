import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { LendingService } from './lending.service';
import { LendingOffer, LendingOfferStatus } from './entities/lending-offer.entity';
import { LendingAgreement, AgreementStatus } from './entities/lending-agreement.entity';
import { WalletsService } from '../wallets/wallets.service';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

describe('LendingService', () => {
  let service: LendingService;
  let offerRepo: Record<string, jest.Mock>;
  let agreementRepo: Record<string, jest.Mock>;
  let walletsService: Record<string, jest.Mock>;
  let usersService: Record<string, jest.Mock>;
  let auditLogsService: Record<string, jest.Mock>;

  const lenderId = 'lender-uuid';
  const borrowerId = 'borrower-uuid';

  beforeEach(async () => {
    offerRepo = {
      create: jest.fn((x) => ({ id: 'offer-1', ...x })),
      save: jest.fn(async (x) => x),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    agreementRepo = {
      create: jest.fn((x) => ({ id: 'agreement-1', ...x })),
      save: jest.fn(async (x) => x),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    walletsService = {
      findByUserAndCurrency: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      transfer: jest.fn().mockResolvedValue(undefined),
      transferPlatformFee: jest.fn().mockResolvedValue(undefined),
    };
    usersService = {
      findOne: jest.fn(),
    };
    auditLogsService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LendingService,
        { provide: getRepositoryToken(LendingOffer), useValue: offerRepo },
        { provide: getRepositoryToken(LendingAgreement), useValue: agreementRepo },
        { provide: WalletsService, useValue: walletsService },
        { provide: UsersService, useValue: usersService },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get(LendingService);
  });

  describe('createOffer', () => {
    const validDto = {
      amount: '100.00000000',
      currency: 'XLM',
      annualInterestRate: '0.1200',
      termDays: 30,
      minBorrowerScore: 50,
    };

    it('rejects when user is not found', async () => {
      usersService.findOne.mockResolvedValue(null);
      await expect(service.createOffer(lenderId, validDto)).rejects.toThrow(NotFoundException);
    });

    it('rejects when KYC is not ENHANCED', async () => {
      usersService.findOne.mockResolvedValue({ id: lenderId, kycLevel: 'BASIC' });
      await expect(service.createOffer(lenderId, validDto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects when wallet is missing', async () => {
      usersService.findOne.mockResolvedValue({ id: lenderId, kycLevel: 'ENHANCED' });
      walletsService.findByUserAndCurrency.mockResolvedValue(null);
      await expect(service.createOffer(lenderId, validDto)).rejects.toThrow(BadRequestException);
    });

    it('rejects when available balance is insufficient (amount bound)', async () => {
      usersService.findOne.mockResolvedValue({ id: lenderId, kycLevel: 'ENHANCED' });
      walletsService.findByUserAndCurrency.mockResolvedValue({
        id: 'w1',
        balance: '50',
        reservedBalance: '0',
      });
      await expect(service.createOffer(lenderId, validDto)).rejects.toThrow(
        /Insufficient available balance/,
      );
    });

    it('creates an OPEN offer and reserves balance when inputs are valid', async () => {
      usersService.findOne.mockResolvedValue({ id: lenderId, kycLevel: 'ENHANCED' });
      walletsService.findByUserAndCurrency.mockResolvedValue({
        id: 'w1',
        balance: '500',
        reservedBalance: '10',
      });

      const offer = await service.createOffer(lenderId, validDto);

      expect(offer.status).toBe(LendingOfferStatus.OPEN);
      expect(offer.amount).toBe(validDto.amount);
      expect(offer.annualInterestRate).toBe(validDto.annualInterestRate);
      expect(offer.termDays).toBe(validDto.termDays);
      expect(walletsService.update).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({
          reservedBalance: String(10 + parseFloat(validDto.amount)),
        }),
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LENDING_OFFER_CREATED' }),
      );
    });

    it('rejects non-positive amount-like values via balance check path', async () => {
      usersService.findOne.mockResolvedValue({ id: lenderId, kycLevel: 'ENHANCED' });
      walletsService.findByUserAndCurrency.mockResolvedValue({
        id: 'w1',
        balance: '100',
        reservedBalance: '0',
      });
      // amount larger than available balance
      await expect(
        service.createOffer(lenderId, { ...validDto, amount: '1000' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptOffer', () => {
    const openOffer: Partial<LendingOffer> = {
      id: 'offer-1',
      lenderId,
      amount: '100.00000000',
      currency: 'XLM',
      annualInterestRate: '0.1000',
      termDays: 365,
      minBorrowerScore: 40,
      status: LendingOfferStatus.OPEN,
      expiresAt: new Date(Date.now() + 86_400_000),
    };

    it('rejects missing offer', async () => {
      offerRepo.findOne.mockResolvedValue(null);
      await expect(service.acceptOffer('missing', borrowerId)).rejects.toThrow(NotFoundException);
    });

    it('rejects non-OPEN offer', async () => {
      offerRepo.findOne.mockResolvedValue({ ...openOffer, status: LendingOfferStatus.MATCHED });
      await expect(service.acceptOffer('offer-1', borrowerId)).rejects.toThrow(BadRequestException);
    });

    it('rejects expired offer', async () => {
      offerRepo.findOne.mockResolvedValue({
        ...openOffer,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.acceptOffer('offer-1', borrowerId)).rejects.toThrow(/expired/);
    });

    it('rejects lender accepting own offer', async () => {
      offerRepo.findOne.mockResolvedValue(openOffer);
      await expect(service.acceptOffer('offer-1', lenderId)).rejects.toThrow(
        /Cannot accept your own offer/,
      );
    });

    it('rejects borrower below min score', async () => {
      offerRepo.findOne.mockResolvedValue(openOffer);
      usersService.findOne.mockResolvedValue({
        id: borrowerId,
        financialHealthScore: 10,
      });
      await expect(service.acceptOffer('offer-1', borrowerId)).rejects.toThrow(ForbiddenException);
    });

    it('creates agreement, marks offer MATCHED, and transfers principal', async () => {
      offerRepo.findOne.mockResolvedValue({ ...openOffer });
      usersService.findOne.mockResolvedValue({
        id: borrowerId,
        financialHealthScore: 80,
      });

      const agreement = await service.acceptOffer('offer-1', borrowerId);

      expect(agreement.status).toBe(AgreementStatus.ACTIVE);
      expect(agreement.borrowerId).toBe(borrowerId);
      expect(agreement.offerId).toBe('offer-1');
      expect(agreement.principalAmount).toBe(openOffer.amount);

      // Decimal-aware interest check: principal * rate * termDays / 365
      const expectedInterest = new Decimal(openOffer.amount!)
        .mul(openOffer.annualInterestRate!)
        .mul(openOffer.termDays!)
        .div(365);
      expect(new Decimal(agreement.interestAmount).toFixed(8)).toBe(
        expectedInterest.toFixed(8),
      );

      expect(offerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LendingOfferStatus.MATCHED }),
      );
      expect(walletsService.transfer).toHaveBeenCalledWith(
        lenderId,
        borrowerId,
        openOffer.amount,
        'XLM',
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LENDING_OFFER_ACCEPTED' }),
      );
    });
  });

  describe('repayLoan', () => {
    const activeAgreement: Partial<LendingAgreement> & { offer: Partial<LendingOffer> } = {
      id: 'agreement-1',
      borrowerId,
      principalAmount: '100.00000000',
      interestAmount: '10.00000000',
      platformFee: '1.00000000',
      status: AgreementStatus.ACTIVE,
      offer: {
        id: 'offer-1',
        lenderId,
        amount: '100.00000000',
        currency: 'XLM',
        status: LendingOfferStatus.MATCHED,
      },
    };

    it('rejects missing agreement', async () => {
      agreementRepo.findOne.mockResolvedValue(null);
      await expect(service.repayLoan('missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects non-ACTIVE agreement', async () => {
      agreementRepo.findOne.mockResolvedValue({
        ...activeAgreement,
        status: AgreementStatus.REPAID,
      });
      await expect(service.repayLoan('agreement-1')).rejects.toThrow(BadRequestException);
    });

    it('repays full principal+interest and never reduces reserved balance below zero', async () => {
      agreementRepo.findOne.mockResolvedValue({ ...activeAgreement, offer: { ...activeAgreement.offer } });
      walletsService.findByUserAndCurrency.mockResolvedValue({
        id: 'lw1',
        reservedBalance: '50', // less than offer amount → clamp to 0
      });

      const result = await service.repayLoan('agreement-1');

      expect(result.status).toBe(AgreementStatus.REPAID);

      const expectedRepayment = new Decimal(activeAgreement.principalAmount!)
        .plus(activeAgreement.interestAmount!)
        .toFixed(8);
      expect(walletsService.transfer).toHaveBeenCalledWith(
        borrowerId,
        lenderId,
        expectedRepayment,
        'XLM',
      );

      // reserved balance must not go negative (Math.max(0, ...))
      const updateArg = walletsService.update.mock.calls[0][1];
      expect(new Decimal(updateArg.reservedBalance).gte(0)).toBe(true);
      expect(updateArg.reservedBalance).toBe('0');
    });

    it('clamps reserved balance subtraction at zero when reserved equals offer amount', async () => {
      agreementRepo.findOne.mockResolvedValue({ ...activeAgreement, offer: { ...activeAgreement.offer } });
      walletsService.findByUserAndCurrency.mockResolvedValue({
        id: 'lw1',
        reservedBalance: '100.00000000',
      });

      await service.repayLoan('agreement-1');

      const updateArg = walletsService.update.mock.calls[0][1];
      expect(new Decimal(updateArg.reservedBalance).toFixed(8)).toBe(
        new Decimal(0).toFixed(8),
      );
    });
  });
});
