import { Test, TestingModule } from '@nestjs/testing';
import { WidgetsController } from './widgets.controller';
import { WidgetsService } from './widgets.service';

// Manual mock prevents ts-jest from transpiling the real widgets.service.ts,
// which avoids broken dead-code in its transitive dependency chain.
jest.mock('./widgets.service', () => ({
  WidgetsService: jest.fn().mockImplementation(() => ({})),
}));

describe('WidgetsController', () => {
  let controller: WidgetsController;

  const mockService = {
    getWidgets: jest.fn(),
    getWidgetData: jest.fn(),
    listRegistry: jest.fn(),
    upsertWidget: jest.fn(),
  };

  const req = { user: { userId: 'user-1' } };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WidgetsController],
      providers: [{ provide: WidgetsService, useValue: mockService }],
    }).compile();

    controller = module.get<WidgetsController>(WidgetsController);
  });

  describe('getWidgets', () => {
    it('should parse comma-separated types and return wrapped result', async () => {
      mockService.getWidgets.mockResolvedValue({
        'balance-summary': { wallets: [], refreshIn: 30 },
        'quick-actions': { actions: ['send'], refreshIn: 30 },
      });

      const result = await controller.getWidgets(
        req,
        'balance-summary,quick-actions',
      );

      expect(mockService.getWidgets).toHaveBeenCalledWith('user-1', [
        'balance-summary',
        'quick-actions',
      ]);
      expect(result).toHaveProperty('widgets');
    });

    it('should handle empty types parameter', async () => {
      mockService.getWidgets.mockResolvedValue({});

      const result = await controller.getWidgets(req, '');

      expect(mockService.getWidgets).toHaveBeenCalledWith('user-1', []);
      expect(result.widgets).toEqual({});
    });

    it('should handle undefined types parameter', async () => {
      mockService.getWidgets.mockResolvedValue({});

      await controller.getWidgets(req, undefined as unknown as string);

      expect(mockService.getWidgets).toHaveBeenCalledWith('user-1', []);
    });

    it('should filter out empty entries from whitespace', async () => {
      mockService.getWidgets.mockResolvedValue({});

      await controller.getWidgets(req, ' , , ');

      expect(mockService.getWidgets).toHaveBeenCalledWith('user-1', []);
    });
  });

  describe('individual widget endpoints', () => {
    const widgetEndpoints = [
      ['balanceSummary', 'balance-summary'],
      ['recentTransactions', 'recent-transactions'],
      ['exchangeRateTicker', 'exchange-rate-ticker'],
      ['savingsProgress', 'savings-progress'],
      ['rateAlerts', 'rate-alerts'],
      ['quickActions', 'quick-actions'],
      ['loyaltyPoints', 'loyalty-points'],
      ['spendingGoals', 'spending-goals'],
    ] as const;

    it.each(widgetEndpoints)(
      '%s should delegate to getWidgetData with type "%s"',
      async (method, type) => {
        const mockResult = { refreshIn: 30 };
        mockService.getWidgetData.mockResolvedValue(mockResult);

        const fn = (controller as any)[method].bind(controller);
        const result = await fn(req);

        expect(mockService.getWidgetData).toHaveBeenCalledWith('user-1', type);
        expect(result).toEqual(mockResult);
      },
    );
  });

  describe('listRegistry (admin)', () => {
    it('should delegate to service.listRegistry', async () => {
      mockService.listRegistry.mockResolvedValue([{ type: 'balance-summary' }]);

      const result = await controller.listRegistry();

      expect(mockService.listRegistry).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ type: 'balance-summary' }]);
    });
  });

  describe('upsertWidget (admin)', () => {
    it('should delegate to service.upsertWidget with the provided dto', async () => {
      const dto = { type: 'portfolio-chart', dataEndpoint: '/api/portfolio' };
      mockService.upsertWidget.mockResolvedValue({ id: 'new-id', ...dto });

      const result = await controller.upsertWidget(dto);

      expect(mockService.upsertWidget).toHaveBeenCalledWith(dto);
      expect(result.type).toBe('portfolio-chart');
    });
  });
});
