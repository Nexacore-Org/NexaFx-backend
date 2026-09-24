/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
/**
 * Unit tests for CardsService.
 *
 * stripe is not installed — a manual mock at src/__mocks__/stripe.ts stubs the
 * SDK so no real Stripe calls are made.
 */

jest.mock('stripe');

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CardsService } from './cards.service';
import { VirtualCard, CardStatus } from './entities/virtual-card.entity';
import { User } from '../users/user.entity';
import { KycRecord, KycStatus } from '../kyc/entities/kyc.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { UsersService } from '../users/users.service';
import StripeMock from '../__mocks__/stripe';

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

const makeRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  count: jest.fn(),
});

const mockConfigService = {
  get: jest.fn((key: string): string | null => {
    const cfg: Record<string, string> = {
      STRIPE_SECRET_KEY: 'sk_test_mock',
      STRIPE_CARDS_WEBHOOK_SECRET: 'whsec_mock',
    };
    return cfg[key] ?? null;
  }),
};

const mockUsersService = {
  findById: jest.fn(),
  updateByUserId: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1';
const CARD_ID = 'card-uuid-1';

const buildUser = (overrides: Record<string, unknown> = {}): User =>
  ({
    id: USER_ID,
    email: 'user@test.com',
    firstName: 'Test',
    lastName: 'User',
    phone: '+1234567890',
    stripeCardholderId: null,
    balances: { USD: 1000 },
    ...overrides,
  } as unknown as User);

const buildKyc = (overrides: Record<string, unknown> = {}): KycRecord =>
  ({
    userId: USER_ID,
    status: KycStatus.APPROVED,
    fullName: 'Test User',
    dateOfBirth: new Date('1990-01-15'),
    ...overrides,
  } as unknown as KycRecord);

const buildCard = (overrides: Record<string, unknown> = {}): VirtualCard =>
  ({
    id: CARD_ID,
    userId: USER_ID,
    stripeCardId: 'ic_test_mock',
    last4: '4242',
    expMonth: '12',
    expYear: '2027',
    brand: 'Visa',
    status: CardStatus.ACTIVE,
    spendLimit: null,
    blockedMccs: [],
    ...overrides,
  } as unknown as VirtualCard);

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('CardsService', () => {
  let service: CardsService;
  let virtualCardRepo: ReturnType<typeof makeRepo>;
  let userRepo: ReturnType<typeof makeRepo>;
  let kycRepo: ReturnType<typeof makeRepo>;
  const stripe = StripeMock.__instance;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: getRepositoryToken(VirtualCard), useFactory: makeRepo },
        { provide: getRepositoryToken(User), useFactory: makeRepo },
        { provide: getRepositoryToken(KycRecord), useFactory: makeRepo },
        { provide: getRepositoryToken(Transaction), useFactory: makeRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<CardsService>(CardsService);
    virtualCardRepo = module.get(getRepositoryToken(VirtualCard));
    userRepo = module.get(getRepositoryToken(User));
    kycRepo = module.get(getRepositoryToken(KycRecord));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // createCard
  // -------------------------------------------------------------------------
  describe('createCard', () => {
    it('creates a virtual card for a KYC-approved user with no active card', async () => {
      kycRepo.findOne
        .mockResolvedValueOnce(buildKyc())  // checkUserKycApproved
        .mockResolvedValueOnce(buildKyc()); // getOrCreateStripeCardholder
      virtualCardRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(buildUser());
      userRepo.save.mockResolvedValue(buildUser({ stripeCardholderId: 'ich_1' }));
      stripe.issuing.cardholders.create.mockResolvedValue({ id: 'ich_1' });
      stripe.issuing.cards.create.mockResolvedValue({
        id: 'ic_test_mock',
        last4: '4242',
        exp_month: 12,
        exp_year: 2027,
        brand: 'Visa',
      });
      virtualCardRepo.create.mockReturnValue(buildCard());
      virtualCardRepo.save.mockResolvedValue(buildCard());

      const result = await service.createCard(USER_ID);

      expect(kycRepo.findOne).toHaveBeenCalledWith({
        where: { userId: USER_ID, status: KycStatus.APPROVED },
      });
      expect(stripe.issuing.cards.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'virtual', currency: 'usd' }),
      );
      expect(result.status).toBe(CardStatus.ACTIVE);
    });

    it('throws ForbiddenException when KYC is not approved', async () => {
      kycRepo.findOne.mockResolvedValue(null);
      await expect(service.createCard(USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when an active card already exists', async () => {
      kycRepo.findOne.mockResolvedValue(buildKyc());
      virtualCardRepo.findOne.mockResolvedValue(buildCard());
      await expect(service.createCard(USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the User row does not exist', async () => {
      kycRepo.findOne.mockResolvedValue(buildKyc());
      virtualCardRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.createCard(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('reuses existing Stripe cardholder ID and skips cardholder creation', async () => {
      kycRepo.findOne.mockResolvedValue(buildKyc());
      virtualCardRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(buildUser({ stripeCardholderId: 'ich_existing' }));
      stripe.issuing.cards.create.mockResolvedValue({
        id: 'ic_new',
        last4: '9999',
        exp_month: 6,
        exp_year: 2028,
        brand: 'Mastercard',
      });
      virtualCardRepo.create.mockReturnValue(buildCard());
      virtualCardRepo.save.mockResolvedValue(buildCard());

      await service.createCard(USER_ID);

      expect(stripe.issuing.cardholders.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCards
  // -------------------------------------------------------------------------
  describe('getCards', () => {
    it('returns all cards belonging to the user', async () => {
      const cards = [buildCard(), buildCard({ id: 'card-2' })];
      virtualCardRepo.find.mockResolvedValue(cards);

      const result = await service.getCards(USER_ID);

      expect(virtualCardRepo.find).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(result).toHaveLength(2);
    });

    it('returns empty array when user has no cards', async () => {
      virtualCardRepo.find.mockResolvedValue([]);
      expect(await service.getCards(USER_ID)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getCardById
  // -------------------------------------------------------------------------
  describe('getCardById', () => {
    it('returns the card when found', async () => {
      virtualCardRepo.findOne.mockResolvedValue(buildCard());
      const result = await service.getCardById(CARD_ID, USER_ID);
      expect(result.id).toBe(CARD_ID);
    });

    it('throws NotFoundException when card is missing or belongs to another user', async () => {
      virtualCardRepo.findOne.mockResolvedValue(null);
      await expect(service.getCardById(CARD_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // revealCard
  // -------------------------------------------------------------------------
  describe('revealCard', () => {
    it('returns an ephemeral key scoped to the card', async () => {
      virtualCardRepo.findOne.mockResolvedValue(buildCard());
      stripe.ephemeralKeys.create.mockResolvedValue({ secret: 'ek_live_secret' });

      const result = await service.revealCard(CARD_ID, USER_ID);

      expect(stripe.ephemeralKeys.create).toHaveBeenCalledWith(
        { issuing_card: 'ic_test_mock' },
        { apiVersion: expect.any(String) },
      );
      expect(result.ephemeralKey).toBe('ek_live_secret');
    });

    it('throws NotFoundException when card not found', async () => {
      virtualCardRepo.findOne.mockResolvedValue(null);
      await expect(service.revealCard(CARD_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // freezeCard
  // -------------------------------------------------------------------------
  describe('freezeCard', () => {
    it('sets status to FROZEN and marks the card inactive on Stripe', async () => {
      virtualCardRepo.findOne.mockResolvedValue(buildCard());
      stripe.issuing.cards.update.mockResolvedValue({});
      virtualCardRepo.save.mockResolvedValue(buildCard({ status: CardStatus.FROZEN }));

      const result = await service.freezeCard(CARD_ID, USER_ID);

      expect(stripe.issuing.cards.update).toHaveBeenCalledWith('ic_test_mock', { status: 'inactive' });
      expect(result.status).toBe(CardStatus.FROZEN);
    });

    it('throws NotFoundException for unknown card', async () => {
      virtualCardRepo.findOne.mockResolvedValue(null);
      await expect(service.freezeCard(CARD_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // unfreezeCard
  // -------------------------------------------------------------------------
  describe('unfreezeCard', () => {
    it('sets status to ACTIVE and marks the card active on Stripe', async () => {
      virtualCardRepo.findOne.mockResolvedValue(buildCard({ status: CardStatus.FROZEN }));
      stripe.issuing.cards.update.mockResolvedValue({});
      virtualCardRepo.save.mockResolvedValue(buildCard());

      const result = await service.unfreezeCard(CARD_ID, USER_ID);

      expect(stripe.issuing.cards.update).toHaveBeenCalledWith('ic_test_mock', { status: 'active' });
      expect(result.status).toBe(CardStatus.ACTIVE);
    });

    it('throws NotFoundException for unknown card', async () => {
      virtualCardRepo.findOne.mockResolvedValue(null);
      await expect(service.unfreezeCard(CARD_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // cancelCard
  // -------------------------------------------------------------------------
  describe('cancelCard', () => {
    it('sets status to CANCELLED and cancels on Stripe', async () => {
      virtualCardRepo.findOne.mockResolvedValue(buildCard());
      stripe.issuing.cards.update.mockResolvedValue({});
      virtualCardRepo.save.mockResolvedValue(buildCard({ status: CardStatus.CANCELLED }));

      await service.cancelCard(CARD_ID, USER_ID);

      expect(stripe.issuing.cards.update).toHaveBeenCalledWith('ic_test_mock', { status: 'canceled' });
      expect(virtualCardRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: CardStatus.CANCELLED }),
      );
    });

    it('throws NotFoundException for unknown card', async () => {
      virtualCardRepo.findOne.mockResolvedValue(null);
      await expect(service.cancelCard(CARD_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // updateCardControls
  // -------------------------------------------------------------------------
  describe('updateCardControls', () => {
    it('updates spend limit and blocked MCCs on Stripe and the local record', async () => {
      virtualCardRepo.findOne.mockResolvedValue(buildCard());
      stripe.issuing.cards.update.mockResolvedValue({});
      virtualCardRepo.save.mockResolvedValue(
        buildCard({ spendLimit: '500.00', blockedMccs: ['5734'] }),
      );

      const result = await service.updateCardControls(CARD_ID, USER_ID, {
        spendLimit: '500.00',
        blockedMccs: ['5734'],
      });

      expect(stripe.issuing.cards.update).toHaveBeenCalled();
      expect(result.spendLimit).toBe('500.00');
      expect(result.blockedMccs).toEqual(['5734']);
    });

    it('skips the Stripe API call when dto carries no updates', async () => {
      virtualCardRepo.findOne.mockResolvedValue(buildCard());
      virtualCardRepo.save.mockResolvedValue(buildCard());

      await service.updateCardControls(CARD_ID, USER_ID, {});

      expect(stripe.issuing.cards.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // handleStripeWebhook
  // -------------------------------------------------------------------------
  describe('handleStripeWebhook', () => {
    it('throws BadRequestException when webhook secret is not configured', async () => {
      const savedGet = mockConfigService.get;
      mockConfigService.get = jest.fn().mockReturnValue(null) as typeof savedGet;

      await expect(
        service.handleStripeWebhook(Buffer.from('{}'), 'sig'),
      ).rejects.toThrow(BadRequestException);

      mockConfigService.get = savedGet;
    });

    it('throws BadRequestException when signature verification fails', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid sig');
      });
      await expect(
        service.handleStripeWebhook(Buffer.from('{}'), 'bad_sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('declines authorization when card is not found', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'issuing_authorization.request',
        data: { object: { id: 'auth_1', card: { id: 'ic_unknown' }, amount: 100 } },
      });
      virtualCardRepo.findOne.mockResolvedValue(null);

      await service.handleStripeWebhook(Buffer.from('{}'), 'sig');

      expect(stripe.issuing.authorizations.decline).toHaveBeenCalledWith('auth_1');
    });

    it('declines authorization when user is not found', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'issuing_authorization.request',
        data: { object: { id: 'auth_2', card: { id: 'ic_test_mock' }, amount: 500 } },
      });
      virtualCardRepo.findOne.mockResolvedValue(buildCard());
      userRepo.findOne.mockResolvedValue(null);

      await service.handleStripeWebhook(Buffer.from('{}'), 'sig');

      expect(stripe.issuing.authorizations.decline).toHaveBeenCalledWith('auth_2');
    });

    it('approves authorization when user has sufficient USD balance', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'issuing_authorization.request',
        data: { object: { id: 'auth_3', card: { id: 'ic_test_mock' }, amount: 5000 } }, // $50
      });
      virtualCardRepo.findOne.mockResolvedValue(buildCard());
      userRepo.findOne.mockResolvedValue(buildUser({ balances: { USD: 1000 } }));

      await service.handleStripeWebhook(Buffer.from('{}'), 'sig');

      expect(stripe.issuing.authorizations.approve).toHaveBeenCalledWith('auth_3');
    });

    it('declines authorization when balance is insufficient', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'issuing_authorization.request',
        data: { object: { id: 'auth_4', card: { id: 'ic_test_mock' }, amount: 200000 } }, // $2000
      });
      virtualCardRepo.findOne.mockResolvedValue(buildCard());
      userRepo.findOne.mockResolvedValue(buildUser({ balances: { USD: 500 } }));

      await service.handleStripeWebhook(Buffer.from('{}'), 'sig');

      expect(stripe.issuing.authorizations.decline).toHaveBeenCalledWith('auth_4');
    });
  });
});
