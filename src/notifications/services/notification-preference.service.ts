import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationType } from '../enum/notificationType.enum';
import { NotificationChannel } from '../enum/notificationChannel.enum';

@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name);
  private readonly cache = new Map<string, { data: any; expiry: number }>();
  private readonly CACHE_TTL = 30 * 1000; // 30 seconds

  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
  ) {}

  /**
   * Get or create default preferences for all notification types
   */
  async getOrCreateDefaults(userId: string): Promise<NotificationPreference[]> {
    const existing = await this.preferenceRepository.find({
      where: { userId },
    });

    if (existing.length > 0) {
      return existing;
    }

    // Create default preferences for all notification types
    const allTypes = Object.values(NotificationType);
    const defaultChannels = {
      [NotificationChannel.IN_APP]: true,
      [NotificationChannel.EMAIL]: true,
      [NotificationChannel.SMS]: true,
      [NotificationChannel.PUSH_NOTIFICATION]: true,
      [NotificationChannel.BOTH]: true,
    };

    const preferences = allTypes.map((type) =>
      this.preferenceRepository.create({
        userId,
        notificationType: type,
        channels: { ...defaultChannels },
      }),
    );

    const saved = await this.preferenceRepository.save(preferences);
    this.invalidateCache(userId);
    return saved;
  }

  /**
   * Get preferences grouped by notification type (cache-backed)
   */
  async getPreferences(userId: string): Promise<NotificationPreference[]> {
    const cached = this.getFromCache(userId);
    if (cached) {
      return cached;
    }

    const preferences = await this.preferenceRepository.find({
      where: { userId },
      order: { notificationType: 'ASC' },
    });

    this.setCache(userId, preferences);
    return preferences;
  }

  /**
   * Update preferences atomically and invalidate cache
   */
  async updatePreferences(
    userId: string,
    updates: Array<{
      type: NotificationType;
      channels: Partial<Record<NotificationChannel, boolean>>;
    }>,
  ): Promise<NotificationPreference[]> {
    const results: NotificationPreference[] = [];

    for (const update of updates) {
      // SECURITY type cannot be disabled
      if (update.type === NotificationType.SECURITY) {
        this.logger.warn(
          `Attempted to disable SECURITY notifications for user ${userId} - blocked`,
        );
        continue;
      }

      const preference = await this.preferenceRepository.findOne({
        where: { userId, notificationType: update.type },
      });

      if (!preference) {
        continue;
      }

      // Merge channel updates
      preference.channels = {
        ...preference.channels,
        ...update.channels,
      };

      const saved = await this.preferenceRepository.save(preference);
      results.push(saved);
    }

    // Invalidate cache immediately
    this.invalidateCache(userId);

    return results;
  }

  /**
   * Check if notification should be sent on specific channel
   * SECURITY type always returns true (cannot be disabled)
   */
  async shouldSend(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
  ): Promise<boolean> {
    // SECURITY notifications always delivered
    if (type === NotificationType.SECURITY) {
      return true;
    }

    const preferences = await this.getPreferences(userId);
    const preference = preferences.find((p) => p.notificationType === type);

    if (!preference) {
      // Default to allowing if no preference exists
      return true;
    }

    return preference.channels[channel] !== false;
  }

  /**
   * Invalidate cache for user
   */
  private invalidateCache(userId: string): void {
    this.cache.delete(this.getCacheKey(userId));
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache(userId: string): NotificationPreference[] | null {
    const cached = this.cache.get(this.getCacheKey(userId));
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set cache with TTL
   */
  private setCache(userId: string, data: NotificationPreference[]): void {
    this.cache.set(this.getCacheKey(userId), {
      data,
      expiry: Date.now() + this.CACHE_TTL,
    });
  }

  /**
   * Get cache key for user
   */
  private getCacheKey(userId: string): string {
    return `notif_prefs:${userId}`;
  }
}
