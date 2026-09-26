import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MerchantIntegrationService } from './merchant-integration.service';
import {
  MerchantCheckoutSession,
  CheckoutSessionStatus,
} from './entities/merchant-checkout-session.entity';
import { WebhookService } from '../webhooks/services/webhook.service';

const mockSessionRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
});

const mockWebhookService = () => ({
  dispatch: jest.fn().mockResolvedValue(undefined),
});

const makeSession = (
  overrides: Partial<MerchantCheckoutSession> = {},
): MerchantCheckoutSession => ({
  id: 'session-1',
  merchantId: 'merchant-1',
  amount: 100,
  currency: 'USD',
  status: CheckoutSessionStatus.PENDING,
  redirectUrl: 'https://example.com/return',
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  createdAt: new Date(),
  ...overrides,
});

describe('MerchantIntegrationService', () => {
  let service: MerchantIntegrationService;
  let sessionRepo: ReturnType<typeof mockSessionRepo>;
  let webhookService: ReturnType<typeof mockWebhookService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantIntegrationService,
        {
          provide: getRepositoryToken(MerchantCheckoutSession),
          useFactory: mockSessionRepo,
        },
        {
          provide: WebhookService,
          useFactory: mockWebhookService,
        },
      ],
    }).compile();

    service = module.get<MerchantIntegrationService>(
      MerchantIntegrationService,
    );
    sessionRepo = module.get(getRepositoryToken(MerchantCheckoutSession));
    webhookService = module.get(WebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── createCheckoutSession() ───────────────────────────────────────────────
  describe('createCheckoutSession()', () => {
    it('creates and saves a PENDING checkout session', async () => {
      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      const result = await service.createCheckoutSession(
        'merchant-1',
        100,
        'USD',
        'https://example.com/return',
      );

      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'merchant-1',
          amount: 100,
          currency: 'USD',
          redirectUrl: 'https://example.com/return',
          status: CheckoutSessionStatus.PENDING,
        }),
      );
      expect(sessionRepo.save).toHaveBeenCalledWith(session);
      expect(result).toEqual(session);
    });

    it('sets expiresAt approximately 15 minutes in the future', async () => {
      const before = Date.now();
      const session = makeSession();
      sessionRepo.create.mockImplementation((data: any) => data);
      sessionRepo.save.mockImplementation(async (s) => s);

      await service.createCheckoutSession('merchant-1', 50, 'EUR');

      const created = sessionRepo.create.mock.calls[0][0];
      const expiresMs = new Date(created.expiresAt).getTime();
      expect(expiresMs).toBeGreaterThan(before + 14 * 60 * 1000);
      expect(expiresMs).toBeLessThan(before + 16 * 60 * 1000);
    });

    it('creates session without redirectUrl when not provided', async () => {
      const session = makeSession({ redirectUrl: undefined });
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      const result = await service.createCheckoutSession(
        'merchant-1',
        100,
        'USD',
      );

      expect(result).toBeDefined();
    });
  });

  // ─── getSessionStatus() ────────────────────────────────────────────────────
  describe('getSessionStatus()', () => {
    it('returns session when found and not expired', async () => {
      const session = makeSession();
      sessionRepo.findOne.mockResolvedValue(session);

      const result = await service.getSessionStatus('session-1');

      expect(sessionRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'session-1' },
      });
      expect(result.status).toBe(CheckoutSessionStatus.PENDING);
    });

    it('throws NotFoundException when session not found', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(service.getSessionStatus('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('marks session as EXPIRED when past expiresAt', async () => {
      const expired = makeSession({
        status: CheckoutSessionStatus.PENDING,
        expiresAt: new Date(Date.now() - 1000),
      });
      sessionRepo.findOne.mockResolvedValue(expired);
      sessionRepo.save.mockResolvedValue({
        ...expired,
        status: CheckoutSessionStatus.EXPIRED,
      });

      const result = await service.getSessionStatus('session-1');

      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: CheckoutSessionStatus.EXPIRED }),
      );
      expect(result.status).toBe(CheckoutSessionStatus.EXPIRED);
    });

    it('does not update status when session is already PAID (even if expired)', async () => {
      const paid = makeSession({
        status: CheckoutSessionStatus.PAID,
        expiresAt: new Date(Date.now() - 1000),
      });
      sessionRepo.findOne.mockResolvedValue(paid);

      const result = await service.getSessionStatus('session-1');

      expect(sessionRepo.save).not.toHaveBeenCalled();
      expect(result.status).toBe(CheckoutSessionStatus.PAID);
    });
  });

  // ─── completeSession() ─────────────────────────────────────────────────────
  describe('completeSession()', () => {
    it('marks session as PAID and dispatches webhook', async () => {
      const session = makeSession();
      sessionRepo.findOne.mockResolvedValue(session);
      const paid = { ...session, status: CheckoutSessionStatus.PAID };
      sessionRepo.save.mockResolvedValue(paid);

      const result = await service.completeSession('session-1');

      expect(result.status).toBe(CheckoutSessionStatus.PAID);
      expect(webhookService.dispatch).toHaveBeenCalledWith(
        'webhooks.completed',
        expect.objectContaining({
          sessionId: paid.id,
          merchantId: paid.merchantId,
          status: CheckoutSessionStatus.PAID,
        }),
        paid.merchantId,
      );
    });

    it('throws BadRequestException when session is already PAID', async () => {
      const paid = makeSession({ status: CheckoutSessionStatus.PAID });
      sessionRepo.findOne.mockResolvedValue(paid);

      await expect(service.completeSession('session-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when session is EXPIRED', async () => {
      const expired = makeSession({
        status: CheckoutSessionStatus.PENDING,
        expiresAt: new Date(Date.now() - 1000),
      });
      sessionRepo.findOne.mockResolvedValue(expired);
      // getSessionStatus will save the expired status
      sessionRepo.save.mockResolvedValue({
        ...expired,
        status: CheckoutSessionStatus.EXPIRED,
      });

      await expect(service.completeSession('session-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when session not found', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(service.completeSession('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
