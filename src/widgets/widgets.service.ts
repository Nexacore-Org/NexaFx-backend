import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DashboardWidget } from './entities/dashboard-widget.entity';
import { WalletsService } from '../wallets/wallets.service';
import { RateAlertsService } from '../rate-alerts/rate-alerts.service';
import { VaultsService } from '../vaults/vaults.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

type WidgetResult = Record<string, unknown> & { refreshIn: number };
type WidgetResponse = WidgetResult | { error: string };

@Injectable()
export class WidgetsService {
  private readonly logger = new Logger(WidgetsService.name);

  constructor(
    @InjectRepository(DashboardWidget)
    private readonly widgetRepo: Repository<DashboardWidget>,
    private readonly walletsService: WalletsService,
    private readonly rateAlertsService: RateAlertsService,
    private readonly vaultsService: VaultsService,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  async getWidgets(
    userId: string,
    types: string[],
  ): Promise<Record<string, WidgetResponse>> {
    const results = await Promise.all(
      types.map(async (type) => {
        try {
          const data = await this.getWidgetData(userId, type);
          return [type, data] as const;
        } catch (err) {
          this.logger.warn(`Widget ${type} failed: ${err instanceof Error ? err.message : String(err)}`);
          return [type, { error: 'unavailable' }] as const;
        }
      }),
    );
    return Object.fromEntries(results);
  }

  async getWidgetData(userId: string, type: string): Promise<WidgetResult> {
    const registry = await this.widgetRepo.findOne({ where: { type, isActive: true } });
    const refreshIn = registry?.refreshIntervalSeconds ?? 30;

    switch (type) {
      case 'balance-summary':
        return this.balanceSummary(userId, refreshIn);
      case 'recent-transactions':
        return this.recentTransactions(userId, refreshIn);
      case 'exchange-rate-ticker':
        return this.exchangeRateTicker(refreshIn);
      case 'savings-progress':
        return this.savingsProgress(userId, refreshIn);
      case 'rate-alerts':
        return this.rateAlerts(userId, refreshIn);
      case 'quick-actions':
        return { actions: ['send', 'receive', 'swap', 'pay'], refreshIn };
      case 'loyalty-points':
        return { points: 0, nextMilestone: 100, refreshIn };
      case 'spending-goals':
        return this.spendingGoals(userId, refreshIn);
      default:
        return { refreshIn };
    }
  }

  private async balanceSummary(userId: string, refreshIn: number): Promise<WidgetResult> {
    const wallets = await this.walletsService.findAllByUser(userId);
    return {
      wallets: wallets.map((w) => ({ currency: w.currency, balance: w.balance, label: w.label })),
      refreshIn,
    };
  }

  private async recentTransactions(userId: string, refreshIn: number): Promise<WidgetResult> {
    // Minimal stub — full implementation would inject TransactionsService
    return { transactions: [], refreshIn };
  }

  private async exchangeRateTicker(refreshIn: number): Promise<WidgetResult> {
    try {
      const [xlmNgn, xlmUsd] = await Promise.allSettled([
        this.exchangeRatesService.getRate('XLM', 'NGN'),
        this.exchangeRatesService.getRate('XLM', 'USD'),
      ]);
      return {
        rates: {
          'XLM/NGN': xlmNgn.status === 'fulfilled' ? (xlmNgn.value as any).rate : null,
          'XLM/USD': xlmUsd.status === 'fulfilled' ? (xlmUsd.value as any).rate : null,
        },
        refreshIn,
      };
    } catch {
      return { rates: {}, refreshIn };
    }
  }

  private async savingsProgress(userId: string, refreshIn: number): Promise<WidgetResult> {
    const vaults = await this.vaultsService.listVaults(userId);
    const active = vaults.filter((v: any) => v.status === 'ACTIVE');
    if (active.length === 0) return { vaults: [], refreshIn };
    return {
      vaults: active.map((v: any) => ({
        name: v.name,
        current: v.currentBalance,
        target: v.targetAmount,
        progressPct: v.targetAmount
          ? Math.min(100, (parseFloat(v.currentBalance) / parseFloat(v.targetAmount)) * 100).toFixed(1)
          : null,
      })),
      refreshIn,
    };
  }

  private async rateAlerts(userId: string, refreshIn: number): Promise<WidgetResult> {
    const alerts = await this.rateAlertsService.getUserAlerts(userId);
    const active = alerts.filter((a) => a.isActive);
    return { alerts: active, refreshIn };
  }

  private async spendingGoals(userId: string, refreshIn: number): Promise<WidgetResult> {
    return { goals: [], refreshIn };
  }

  // Admin registry management
  async upsertWidget(dto: Partial<DashboardWidget>): Promise<DashboardWidget> {
    const existing = dto.type
      ? await this.widgetRepo.findOne({ where: { type: dto.type } })
      : null;
    if (existing) {
      Object.assign(existing, dto);
      return this.widgetRepo.save(existing);
    }
    return this.widgetRepo.save(this.widgetRepo.create(dto));
  }

  async listRegistry(): Promise<DashboardWidget[]> {
    return this.widgetRepo.find({ order: { type: 'ASC' } });
  }
}
