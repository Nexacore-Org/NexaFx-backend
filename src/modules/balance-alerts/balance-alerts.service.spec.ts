import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BalanceAlertsService } from './balance-alerts.service';
import { BalanceAlert } from './entities/balance-alert.entity';

const mockAlert = (overrides = {}): BalanceAlert =>
  ({ id: '1', walletId: 'w-123', assetCode: 'USDC', thresholdAmount: 1000, triggerType: 'BELOW', notificationMethod: 'EMAIL', lastTriggeredAt: 0, createdAt: new Date(), ...overrides } as BalanceAlert);

describe('BalanceAlertsService', () => {
  let service: BalanceAlertsService;
  let savedAlerts: BalanceAlert[] = [];

  const mockRepo = {
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(async (entity) => { savedAlerts.push(entity); return entity; }),
    find: jest.fn(async () => savedAlerts),
    findOne: jest.fn(async ({ where: { id } }) => savedAlerts.find((a) => a.id === id) ?? null),
    remove: jest.fn(async (entity) => { savedAlerts = savedAlerts.filter((a) => a !== entity); }),
  };

  beforeEach(async () => {
    savedAlerts = [];
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceAlertsService,
        { provide: getRepositoryToken(BalanceAlert), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<BalanceAlertsService>(BalanceAlertsService);
  });

  it('should trigger BELOW alert when balance drops below threshold', async () => {
    mockRepo.find.mockResolvedValueOnce([mockAlert()]);
    const triggered = await service.checkBalanceAndNotify({ walletId: 'w-123', assetCode: 'USDC', currentBalance: 500 });
    expect(triggered.length).toBe(1);
    expect(triggered[0].triggerType).toBe('BELOW');
  });

  it('should respect the cooldown period and not trigger repeatedly', async () => {
    const alert = mockAlert({ lastTriggeredAt: Date.now() });
    mockRepo.find.mockResolvedValue([alert]);
    const triggered = await service.checkBalanceAndNotify({ walletId: 'w-123', assetCode: 'USDC', currentBalance: 500 });
    expect(triggered.length).toBe(0);
  });
});
