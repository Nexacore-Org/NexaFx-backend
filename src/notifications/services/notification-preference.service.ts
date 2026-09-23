import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { NotificationType } from '../enum/notificationType.enum';
import {
  NotificationDigestMode,
  NotificationPreference,
} from '../entities/notification-preference.entity';
import { NotificationPreferenceUpdateDto } from '../dto/notification-preference.dto';

// NOTE: `NotificationType.SYSTEM` used to be listed here, but that member does
// not exist on the enum — it evaluated to `undefined` at runtime, so TRANSACTION
// was already the only effectively non-disableable type. Kept as-is to preserve
// behaviour while making the file type-check.
const NON_DISABLEABLE_TYPES = new Set<NotificationType>([
  NotificationType.TRANSACTION,
]);

@Injectable()
export class NotificationPreferenceService {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
    private readonly configService: ConfigService,
  ) {}

  async createDefaults(userId: string): Promise<void> {
    const preferences = Object.values(NotificationType).map(
      (notificationType) =>
        this.preferenceRepository.create({
          userId,
          notificationType,
          emailEnabled: true,
          pushEnabled: true,
          inAppEnabled: true,
          digestMode: NotificationDigestMode.IMMEDIATE,
        }),
    );

    await this.preferenceRepository
      .createQueryBuilder()
      .insert()
      .into(NotificationPreference)
      .values(preferences)
      .orIgnore()
      .execute();
  }

  async findAll(userId: string): Promise<NotificationPreference[]> {
    await this.createDefaults(userId);
    return this.preferenceRepository.find({
      where: { userId },
      order: { notificationType: 'ASC' },
    });
  }

  async updateMany(
    userId: string,
    updates: NotificationPreferenceUpdateDto[],
  ): Promise<NotificationPreference[]> {
    if (!updates?.length) {
      throw new BadRequestException('At least one preference is required');
    }

    await this.createDefaults(userId);

    for (const update of updates) {
      const guarded = this.applyMandatoryChannels(update);
      await this.preferenceRepository.update(
        { userId, notificationType: update.notificationType },
        guarded,
      );
    }

    return this.findAll(userId);
  }

  async getPreference(
    userId: string,
    notificationType: NotificationType,
  ): Promise<NotificationPreference> {
    await this.createDefaults(userId);
    const preference = await this.preferenceRepository.findOne({
      where: { userId, notificationType },
    });

    if (!preference) {
      throw new BadRequestException('Notification preference was not created');
    }

    return preference;
  }

  async isChannelEnabled(
    userId: string,
    notificationType: NotificationType,
    channel: 'email' | 'push' | 'inApp',
  ): Promise<boolean> {
    if (NON_DISABLEABLE_TYPES.has(notificationType)) {
      return true;
    }

    const preference = await this.getPreference(userId, notificationType);

    if (channel === 'email') return preference.emailEnabled;
    if (channel === 'push') return preference.pushEnabled;
    return preference.inAppEnabled;
  }

  async unsubscribe(token: string): Promise<{ message: string }> {
    const payload = this.verifyToken(token);
    await this.createDefaults(payload.userId);

    if (NON_DISABLEABLE_TYPES.has(payload.notificationType)) {
      return { message: 'This notification type cannot be unsubscribed' };
    }

    await this.preferenceRepository.update(
      {
        userId: payload.userId,
        notificationType: payload.notificationType,
      },
      {
        emailEnabled: false,
        digestMode: NotificationDigestMode.IMMEDIATE,
      },
    );

    return { message: 'You have been unsubscribed from these emails' };
  }

  generateUnsubscribeToken(
    userId: string,
    notificationType: NotificationType,
  ): string {
    const body = `${userId}:${notificationType}`;
    const signature = this.sign(body);
    return Buffer.from(`${body}:${signature}`).toString('base64url');
  }

  private applyMandatoryChannels(
    update: NotificationPreferenceUpdateDto,
  ): Partial<NotificationPreference> {
    const guarded: Partial<NotificationPreference> = {
      emailEnabled: update.emailEnabled,
      pushEnabled: update.pushEnabled,
      inAppEnabled: update.inAppEnabled,
      digestMode: update.digestMode,
    };

    if (NON_DISABLEABLE_TYPES.has(update.notificationType)) {
      guarded.emailEnabled = true;
      guarded.pushEnabled = true;
      guarded.inAppEnabled = true;
      guarded.digestMode = NotificationDigestMode.IMMEDIATE;
    }

    return guarded;
  }

  private verifyToken(token: string): {
    userId: string;
    notificationType: NotificationType;
  } {
    let decoded: string;
    try {
      decoded = Buffer.from(token, 'base64url').toString('utf8');
    } catch {
      throw new ForbiddenException('Invalid unsubscribe token');
    }

    const parts = decoded.split(':');
    if (parts.length !== 3) {
      throw new ForbiddenException('Invalid unsubscribe token');
    }

    const [userId, notificationType, signature] = parts;
    if (!Object.values(NotificationType).includes(notificationType as any)) {
      throw new ForbiddenException('Invalid unsubscribe token');
    }

    const expected = this.sign(`${userId}:${notificationType}`);
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new ForbiddenException('Invalid unsubscribe token');
    }

    return {
      userId,
      notificationType: notificationType as NotificationType,
    };
  }

  private sign(payload: string): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new BadRequestException('JWT_SECRET is required');
    }

    return createHmac('sha256', secret).update(payload).digest('hex');
  }
}
