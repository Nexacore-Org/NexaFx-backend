import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DashboardPreference } from './entities/dashboard-preference.entity';
import { SaveDashboardPreferencesDto } from './dto/save-dashboard-preferences.dto';
import {
  DEFAULT_DASHBOARD_WIDGETS,
  WidgetPlacement,
} from './dashboard-preferences.constants';

export interface DashboardPreferencesResult {
  userId: string;
  layout: WidgetPlacement[];
  /** True when the stored layout is the documented default for new users. */
  isDefault: boolean;
  updatedAt?: string;
}

/**
 * Persists a user's dashboard widget layout (which widgets are shown and in
 * what order). Distinct from notification preferences: this is UI layout state,
 * not opt-in/out for notifications.
 */
@Injectable()
export class DashboardPreferencesService {
  constructor(
    @InjectRepository(DashboardPreference)
    private readonly preferencesRepo: Repository<DashboardPreference>,
  ) {}

  /** Retrieve a user's layout, falling back to the default for new users. */
  async getPreferences(userId: string): Promise<DashboardPreferencesResult> {
    const existing = await this.preferencesRepo.findOne({ where: { userId } });
    if (existing) {
      return {
        userId,
        layout: existing.layout,
        isDefault: false,
        updatedAt: existing.updatedAt.toISOString(),
      };
    }
    return { userId, layout: [...DEFAULT_DASHBOARD_WIDGETS], isDefault: true };
  }

  /**
   * Save (upsert) a user's layout. Duplicate widget ids are collapsed to the
   * last occurrence and the result is ordered by `position`, so the rows on
   * `getPreferences` are always deterministic.
   */
  async savePreferences(
    userId: string,
    dto: SaveDashboardPreferencesDto,
  ): Promise<DashboardPreferencesResult> {
    const layout = this.normalizeLayout(dto.layout);

    const existing = await this.preferencesRepo.findOne({ where: { userId } });
    if (existing) {
      existing.layout = layout;
      const saved = await this.preferencesRepo.save(existing);
      return {
        userId,
        layout: saved.layout,
        isDefault: false,
        updatedAt: saved.updatedAt.toISOString(),
      };
    }

    const created = this.preferencesRepo.create({ userId, layout });
    const saved = await this.preferencesRepo.save(created);
    return {
      userId,
      layout: saved.layout,
      isDefault: false,
      updatedAt: saved.createdAt.toISOString(),
    };
  }

  /** Clear a user's saved layout so `getPreferences` falls back to defaults. */
  async resetPreferences(userId: string): Promise<DashboardPreferencesResult> {
    await this.preferencesRepo.delete({ userId });
    return { userId, layout: [...DEFAULT_DASHBOARD_WIDGETS], isDefault: true };
  }

  private normalizeLayout(placements: WidgetPlacement[]): WidgetPlacement[] {
    const byId = new Map<string, WidgetPlacement>();
    for (const placement of placements) {
      byId.set(placement.id, placement);
    }
    return [...byId.values()].sort(
      (a, b) => a.position - b.position,
    );
  }
}