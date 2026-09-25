import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { MerchantIntegrationController } from './merchant-integration.controller';
import { MerchantIntegrationService } from './merchant-integration.service';
import { MerchantApiKeyGuard } from './guards/merchant-api-key.guard';
import {
  MerchantCheckoutSession,
  CheckoutSessionStatus,
} from './entities/merchant-checkout-session.entity';

const mockMerchantIntegrationService = () => ({
  createCheckoutSession: jest.fn(),
  getSessionStatus: jest.fn(),
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

describe('MerchantIntegrationController', () => {
  let controller: MerchantIntegrationController;
  let integrationService: ReturnType<typeof mockMerchantIntegrationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantIntegrationController],
      providers: [
        {
          provide: MerchantIntegrationService,
          useFactory: mockMerchantIntegrationService,
        },
      ],
    })
      .overrideGuard(MerchantApiKeyGuard)
      .useValue({ canActivate: (ctx: ExecutionContext) => true })
      .compile();

    controller = module.get<MerchantIntegrationController>(
      MerchantIntegrationController,
    );
    integrationService = module.get(MerchantIntegrationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createCheckoutSession()', () => {
    it('delegates to integrationService with merchantId from request', async () => {
      const session = makeSession();
      integrationService.createCheckoutSession.mockResolvedValue(session);

      const req = { merchantId: 'merchant-1' };

      const result = await controller.createCheckoutSession(
        req,
        100,
        'USD',
        'https://example.com/return',
      );

      expect(integrationService.createCheckoutSession).toHaveBeenCalledWith(
        'merchant-1',
        100,
        'USD',
        'https://example.com/return',
      );
      expect(result).toEqual(session);
    });

    it('passes undefined redirectUrl when not provided', async () => {
      const session = makeSession({ redirectUrl: undefined });
      integrationService.createCheckoutSession.mockResolvedValue(session);

      const req = { merchantId: 'merchant-1' };

      await controller.createCheckoutSession(req, 50, 'EUR', undefined);

      expect(integrationService.createCheckoutSession).toHaveBeenCalledWith(
        'merchant-1',
        50,
        'EUR',
        undefined,
      );
    });
  });

  describe('getCheckoutSession()', () => {
    it('delegates to integrationService.getSessionStatus() with id param', async () => {
      const session = makeSession();
      integrationService.getSessionStatus.mockResolvedValue(session);

      const result = await controller.getCheckoutSession('session-1');

      expect(integrationService.getSessionStatus).toHaveBeenCalledWith(
        'session-1',
      );
      expect(result).toEqual(session);
    });

    it('propagates NotFoundException from service', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      integrationService.getSessionStatus.mockRejectedValue(
        new NotFoundException('Checkout session not found'),
      );

      await expect(controller.getCheckoutSession('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
