import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WidgetsService } from './widgets.service';
import { DashboardWidget } from './entities/dashboard-widget.entity';
import { WalletsService } from '../wallets/wallets.service';
import { RateAlertsService } from '../rate-alerts/rate-alerts.service';
import { VaultsService } from '../vaults/vaults.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

// Manual mocks prevent ts-jest from transpiling the real modules,
// which avoids broken dead-code in their transitive dependency chains.
jest.mock('../wallets/wallets.service', () => ({
  WalletsService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../rate-alerts/rate-alerts.service', () => ({
  RateAlertsService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../vaults/vaults.service', () => ({
  VaultsService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../exchange-rates/exchange-rates.service', () => ({
  ExchangeRatesService: jest.fn().mockImplementation(() => ({})),
}));

describe('WidgetsService', () => {
  let service: WidgetsService;

  const mockWidgetRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockWalletsService = {
    findAllByUser: jest.fn(),
  };

  const mockRateAlertsService = {
    getUserAlerts: jest.fn(),
  };

  const mockVaultsService = {
    listVaults: jest.fn(),
  };

  const mockExchangeRatesService = {
    getRate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WidgetsService,
        {
          provide: getRepositoryToken(DashboardWidget),
          useValue: mockWidgetRepo,
        },
        { provide: WalletsService, useValue: mockWalletsService },
        { provide: RateAlertsService, useValue: mockRateAlertsService },
        { provide: VaultsService, useValue: mockVaultsService },
        { provide: ExchangeRatesService, useValue: mockExchangeRatesService },
      ],
    }).compile();

    service = module.get<WidgetsService>(WidgetsService);
  });

  describe('getWidgets', () => {
    it('should fetch multiple widget types in parallel and return as a map', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockWalletsService.findAllByUser.mockResolvedValue([]);

      const result = await service.getWidgets('user-1', [
        'balance-summary',
        'quick-actions',
      ]);

      expect(result).toHaveProperty('balance-summary');
      expect(result).toHaveProperty('quick-actions');
    });

    it('should return an error entry for a widget type that throws', async () => {
      mockWidgetRepo.findOne.mockImplementation(() => {
        throw new Error('DB connection failed');
      });

      const result = await service.getWidgets('user-1', ['balance-summary']);

      expect(result['balance-summary']).toEqual({ error: 'unavailable' });
    });
  });

  describe('getWidgetData — balance-summary', () => {
    it('should return wallet balances scoped to the requesting user', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockWalletsService.findAllByUser.mockResolvedValue([
        { currency: 'XLM', balance: '100.00000000', label: 'Primary' },
        { currency: 'NGN', balance: '50000.00', label: 'Savings' },
      ]);

      const result = await service.getWidgetData('user-1', 'balance-summary');

      expect(mockWalletsService.findAllByUser).toHaveBeenCalledWith('user-1');
      expect(result).toHaveProperty('wallets');
      expect((result as any).wallets).toHaveLength(2);
      expect((result as any).wallets[0].currency).toBe('XLM');
    });

    it('should use the widget registry refresh interval when available', async () => {
      mockWidgetRepo.findOne.mockResolvedValue({ refreshIntervalSeconds: 60 });

      const result = await service.getWidgetData('user-1', 'balance-summary');

      expect((result as any).refreshIn).toBe(60);
    });

    it('should default refreshIn to 30 when no registry entry exists', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);

      const result = await service.getWidgetData('user-1', 'balance-summary');

      expect((result as any).refreshIn).toBe(30);
    });
  });

  describe('getWidgetData — recent-transactions', () => {
    it('should return a stub with empty transactions', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);

      const result = await service.getWidgetData(
        'user-1',
        'recent-transactions',
      );

      expect((result as any).transactions).toEqual([]);
    });
  });

  describe('getWidgetData — exchange-rate-ticker', () => {
    it('should fetch XLM/NGN and XLM/USD rates', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockExchangeRatesService.getRate.mockImplementation(
        async (from: string, to: string) => ({
          rate: from === 'XLM' && to === 'NGN' ? 1200 : 0.12,
        }),
      );

      const result = await service.getWidgetData(
        'user-1',
        'exchange-rate-ticker',
      );

      expect(mockExchangeRatesService.getRate).toHaveBeenCalledWith(
        'XLM',
        'NGN',
      );
      expect(mockExchangeRatesService.getRate).toHaveBeenCalledWith(
        'XLM',
        'USD',
      );
      expect((result as any).rates['XLM/NGN']).toBe(1200);
      expect((result as any).rates['XLM/USD']).toBe(0.12);
    });

    it('should handle rate fetch failures gracefully with null rates', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockExchangeRatesService.getRate.mockRejectedValue(new Error('Timeout'));

      const result = await service.getWidgetData(
        'user-1',
        'exchange-rate-ticker',
      );

      expect((result as any).rates['XLM/NGN']).toBeNull();
      expect((result as any).rates['XLM/USD']).toBeNull();
    });
  });

  describe('getWidgetData — savings-progress', () => {
    it('should return active vaults with progress percentage', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockVaultsService.listVaults.mockResolvedValue([
        {
          name: 'Vacation Fund',
          status: 'ACTIVE',
          currentBalance: '500.00',
          targetAmount: '1000.00',
        },
        {
          name: 'Emergency',
          status: 'INACTIVE',
          currentBalance: '200.00',
          targetAmount: '1000.00',
        },
      ]);

      const result = await service.getWidgetData('user-1', 'savings-progress');

      expect((result as any).vaults).toHaveLength(1);
      expect((result as any).vaults[0].name).toBe('Vacation Fund');
      expect((result as any).vaults[0].progressPct).toBe('50.0');
    });

    it('should return empty vaults when none are active', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockVaultsService.listVaults.mockResolvedValue([
        {
          name: 'Fund',
          status: 'INACTIVE',
          currentBalance: '100',
          targetAmount: '500',
        },
      ]);

      const result = await service.getWidgetData('user-1', 'savings-progress');

      expect((result as any).vaults).toEqual([]);
    });

    it('should cap progressPct at 100 when target is exceeded', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockVaultsService.listVaults.mockResolvedValue([
        {
          name: 'Overfunded',
          status: 'ACTIVE',
          currentBalance: '1500.00',
          targetAmount: '1000.00',
        },
      ]);

      const result = await service.getWidgetData('user-1', 'savings-progress');

      expect((result as any).vaults[0].progressPct).toBe('100.0');
    });
  });

  describe('getWidgetData — rate-alerts', () => {
    it('should return only active alerts', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockRateAlertsService.getUserAlerts.mockResolvedValue([
        { id: 'a1', isActive: true, targetRate: 1500 },
        { id: 'a2', isActive: false, targetRate: 2000 },
      ]);

      const result = await service.getWidgetData('user-1', 'rate-alerts');

      expect((result as any).alerts).toHaveLength(1);
      expect((result as any).alerts[0].id).toBe('a1');
    });

    it('should scope alerts to the requesting user', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockRateAlertsService.getUserAlerts.mockResolvedValue([]);

      await service.getWidgetData('user-1', 'rate-alerts');

      expect(mockRateAlertsService.getUserAlerts).toHaveBeenCalledWith(
        'user-1',
      );
    });
  });

  describe('getWidgetData — quick-actions', () => {
    it('should return the fixed actions list', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);

      const result = await service.getWidgetData('user-1', 'quick-actions');

      expect((result as any).actions).toEqual([
        'send',
        'receive',
        'swap',
        'pay',
      ]);
    });
  });

  describe('getWidgetData — loyalty-points', () => {
    it('should return default points and next milestone', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);

      const result = await service.getWidgetData('user-1', 'loyalty-points');

      expect((result as any).points).toBe(0);
      expect((result as any).nextMilestone).toBe(100);
    });
  });

  describe('getWidgetData — spending-goals', () => {
    it('should return an empty goals array', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);

      const result = await service.getWidgetData('user-1', 'spending-goals');

      expect((result as any).goals).toEqual([]);
    });
  });

  describe('getWidgetData — unknown type', () => {
    it('should return a result with refreshIn only for unknown widget types', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);

      const result = await service.getWidgetData(
        'user-1',
        'nonexistent-widget',
      );

      expect(result).toEqual({ refreshIn: 30 });
    });
  });

  describe('upsertWidget (admin registry)', () => {
    it('should create a new widget when type does not exist', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockWidgetRepo.create.mockImplementation((dto) => dto);
      mockWidgetRepo.save.mockImplementation((dto) =>
        Promise.resolve({ id: 'new-id', ...dto }),
      );

      const result = await service.upsertWidget({
        type: 'portfolio-chart',
        dataEndpoint: '/api/widgets/portfolio',
      });

      expect(mockWidgetRepo.create).toHaveBeenCalled();
      expect(mockWidgetRepo.save).toHaveBeenCalled();
      expect(result.type).toBe('portfolio-chart');
    });

    it('should update an existing widget when type already exists', async () => {
      const existing = {
        id: 'existing-id',
        type: 'balance-summary',
        dataEndpoint: '/old',
      };
      mockWidgetRepo.findOne.mockResolvedValue(existing);
      mockWidgetRepo.save.mockImplementation((dto) => Promise.resolve(dto));

      const result = await service.upsertWidget({
        type: 'balance-summary',
        dataEndpoint: '/new',
      });

      expect(mockWidgetRepo.create).not.toHaveBeenCalled();
      expect(result.dataEndpoint).toBe('/new');
    });
  });

  describe('listRegistry', () => {
    it('should return all widgets ordered by type ASC', async () => {
      const widgets = [
        { type: 'balance-summary' },
        { type: 'exchange-rate-ticker' },
      ];
      mockWidgetRepo.find.mockResolvedValue(widgets);

      const result = await service.listRegistry();

      expect(mockWidgetRepo.find).toHaveBeenCalledWith({
        order: { type: 'ASC' },
      });
      expect(result).toEqual(widgets);
    });
  });

  describe('widget data-fetching user scoping', () => {
    it('should only fetch wallets belonging to the requesting user for balance-summary', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockWalletsService.findAllByUser.mockResolvedValue([
        { currency: 'XLM', balance: '100', label: 'Primary' },
      ]);

      await service.getWidgetData('user-42', 'balance-summary');

      expect(mockWalletsService.findAllByUser).toHaveBeenCalledTimes(1);
      expect(mockWalletsService.findAllByUser).toHaveBeenCalledWith('user-42');
    });

    it('should only fetch alerts belonging to the requesting user for rate-alerts', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockRateAlertsService.getUserAlerts.mockResolvedValue([]);

      await service.getWidgetData('user-42', 'rate-alerts');

      expect(mockRateAlertsService.getUserAlerts).toHaveBeenCalledWith(
        'user-42',
      );
    });

    it('should only fetch vaults belonging to the requesting user for savings-progress', async () => {
      mockWidgetRepo.findOne.mockResolvedValue(null);
      mockVaultsService.listVaults.mockResolvedValue([]);

      await service.getWidgetData('user-42', 'savings-progress');

      expect(mockVaultsService.listVaults).toHaveBeenCalledWith('user-42');
    });
  });
});
