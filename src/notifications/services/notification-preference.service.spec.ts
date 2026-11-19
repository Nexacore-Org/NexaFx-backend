import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { NotificationType } from '../enum/notificationType.enum';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationPreferenceService } from './notification-preference.service';

describe('NotificationPreferenceService', () => {
  let service: NotificationPreferenceService;
  let preferenceRepository: jest.Mocked<Repository<NotificationPreference>>;

  beforeEach(() => {
    preferenceRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<NotificationPreference>>;

    service = new NotificationPreferenceService(
      preferenceRepository,
      {} as ConfigService,
    );
  });

  it('keeps every channel enabled for non-disableable TRANSACTION notifications', async () => {
    const channels = await service.getChannelPreferences(
      'user-123',
      NotificationType.TRANSACTION,
    );

    expect(channels).toEqual({
      emailEnabled: true,
      pushEnabled: true,
      inAppEnabled: true,
    });
    expect(preferenceRepository.findOne).not.toHaveBeenCalled();
  });

  it('loads one preference row to determine all channel settings', async () => {
    preferenceRepository.findOne.mockResolvedValue({
      emailEnabled: false,
      pushEnabled: true,
      inAppEnabled: false,
    } as NotificationPreference);

    await expect(
      service.getChannelPreferences('user-123', NotificationType.KYC_APPROVED),
    ).resolves.toEqual({
      emailEnabled: false,
      pushEnabled: true,
      inAppEnabled: false,
    });
    expect(preferenceRepository.findOne).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['email', 'emailEnabled'],
    ['push', 'pushEnabled'],
    ['inApp', 'inAppEnabled'],
  ] as const)(
    'returns the %s channel setting from the batched preference row',
    async (channel, property) => {
      preferenceRepository.findOne.mockResolvedValue({
        emailEnabled: false,
        pushEnabled: false,
        inAppEnabled: false,
        [property]: true,
      } as NotificationPreference);

      await expect(
        service.isChannelEnabled(
          'user-123',
          NotificationType.KYC_APPROVED,
          channel,
        ),
      ).resolves.toBe(true);
      expect(preferenceRepository.findOne).toHaveBeenCalledTimes(1);
    },
  );
});
