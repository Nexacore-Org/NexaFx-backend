import { Test, TestingModule } from '@nestjs/testing';
import { ProgrammablePaymentRulesService } from './programmable-payment-rules.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentRule, PaymentRuleTrigger, PaymentRuleAction } from './entities/payment-rule.entity';
import { WalletsService } from '../wallets/wallets.service';
import { TransactionsService } from '../transactions/services/transaction.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Repository } from 'typeorm';

describe('ProgrammablePaymentRulesService', () => {
  let service: ProgrammablePaymentRulesService;
  let ruleRepository: Repository<PaymentRule>;
  let walletsService: WalletsService;
  let transactionsService: TransactionsService;
  let notificationsService: NotificationsService;

  const mockRuleRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockWalletsService = {
    findAllByUser: jest.fn(),
    findByUserAndCurrency: jest.fn(),
  };

  const mockTransactionsService = {
    createSwap: jest.fn(),
  };

  const mockNotificationsService = {
    dispatch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgrammablePaymentRulesService,
        {
          provide: getRepositoryToken(PaymentRule),
          useValue: mockRuleRepository,
        },
        {
          provide: WalletsService,
          useValue: mockWalletsService,
        },
        {
          provide: TransactionsService,
          useValue: mockTransactionsService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    service = module.get<ProgrammablePaymentRulesService>(ProgrammablePaymentRulesService);
    ruleRepository = module.get<Repository<PaymentRule>>(getRepositoryToken(PaymentRule));
    walletsService = module.get<WalletsService>(WalletsService);
    transactionsService = module.get<TransactionsService>(TransactionsService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateRule', () => {
    it('should trigger SEND_NOTIFICATION when BALANCE_BELOW is met', async () => {
      const mockRule = {
        id: 'rule-1',
        userId: 'user-1',
        name: 'Below 10 XLM alert',
        triggerType: PaymentRuleTrigger.BALANCE_BELOW,
        triggerCondition: { currency: 'XLM', threshold: 10 },
        actionType: PaymentRuleAction.SEND_NOTIFICATION,
        actionParameters: { message: 'XLM low' },
        isActive: true,
        lastEvaluatedAt: null,
        lastTriggeredAt: null,
      } as PaymentRule;

      mockWalletsService.findAllByUser.mockResolvedValue([
        { currency: 'XLM', balance: '5.00000000' },
      ]);

      await service.evaluateRule(mockRule);

      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        'Payment Rule Alert',
        'XLM low',
        { ruleId: 'rule-1' }
      );
      expect(mockRuleRepository.save).toHaveBeenCalled();
    });

    it('should trigger SWAP when BALANCE_ABOVE is met', async () => {
      const mockRule = {
        id: 'rule-2',
        userId: 'user-1',
        name: 'Auto convert profit',
        triggerType: PaymentRuleTrigger.BALANCE_ABOVE,
        triggerCondition: { currency: 'XLM', threshold: 100 },
        actionType: PaymentRuleAction.SWAP,
        actionParameters: { fromCurrency: 'XLM', toCurrency: 'USDC', amount: 50 },
        isActive: true,
        lastEvaluatedAt: null,
        lastTriggeredAt: null,
      } as PaymentRule;

      mockWalletsService.findAllByUser.mockResolvedValue([
        { currency: 'XLM', balance: '150.00000000' },
      ]);

      mockWalletsService.findByUserAndCurrency.mockResolvedValue({
        id: 'wallet-xlm-id',
        publicKey: 'GBC...',
      });

      await service.evaluateRule(mockRule);

      expect(mockTransactionsService.createSwap).toHaveBeenCalledWith('user-1', {
        amount: 50,
        fromCurrency: 'XLM',
        toCurrency: 'USDC',
        sourceAddress: 'GBC...',
        walletId: 'wallet-xlm-id',
      });
    });

    it('should enforce cooldown safety boundary', async () => {
      const mockRule = {
        id: 'rule-3',
        userId: 'user-1',
        triggerType: PaymentRuleTrigger.BALANCE_BELOW,
        triggerCondition: { currency: 'XLM', threshold: 10 },
        actionType: PaymentRuleAction.SEND_NOTIFICATION,
        actionParameters: { message: 'low' },
        isActive: true,
        lastTriggeredAt: new Date(Date.now() - 5000), // triggered 5 seconds ago
      } as PaymentRule;

      await service.evaluateRule(mockRule);

      expect(mockWalletsService.findAllByUser).not.toHaveBeenCalled();
      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
    });
  });
});
