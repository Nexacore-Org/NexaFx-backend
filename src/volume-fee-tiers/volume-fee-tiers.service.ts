import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VolumeFeeTier } from './entities/volume-fee-tier.entity';

@Injectable()
export class VolumeFeeTiersService {
  constructor(
    @InjectRepository(VolumeFeeTier)
    private readonly tiers: Repository<VolumeFeeTier>,
  ) {}

  /** All active tiers, ordered by the volume threshold. */
  listActive(): Promise<VolumeFeeTier[]> {
    return this.tiers.find({
      where: { isActive: true },
      order: { minVolume30dUsd: 'ASC' },
    });
  }

  /**
   * #697: pick the highest tier whose 30-day volume threshold the user meets.
   * Falls back to the lowest tier when none match.
   */
  async resolveTier(volume30dUsd: number): Promise<VolumeFeeTier | null> {
    const active = await this.listActive();
    if (active.length === 0) return null;
    let match = active[0];
    for (const tier of active) {
      if (volume30dUsd >= Number(tier.minVolume30dUsd)) {
        match = tier;
      }
    }
    return match;
  }

  /** The next tier above the given volume, and the volume needed to reach it. */
  async nextTier(volume30dUsd: number) {
    const active = await this.listActive();
    const next = active.find(
      (tier) => Number(tier.minVolume30dUsd) > volume30dUsd,
    );
    if (!next) return { nextTierAt: null, nextTierVolume: null };
    return {
      nextTierAt: next.name,
      nextTierVolume: Number(next.minVolume30dUsd),
    };
  }
}
