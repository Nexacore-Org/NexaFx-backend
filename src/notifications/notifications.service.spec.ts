import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';
import {
  NotificationDigestMode,
  NotificationPreference,
} from './entities/notification-preference.entity';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { User } from '../users/user.entity';
import { FCMService } from '../firebase/fcm.service';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { MailService } from '../modules/mail/mail.service';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let preferenceService: NotificationPreferenceService;
  let notificationRepo: jest.Mocked<Repository<Notification>>;
  let preferenceRepo: {
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
  };
  let userRepo: jest.Mocked<Repository<User>>;
  let fcmService: jest.Mocked<FCMService>;
  let configService: jest.Mocked<ConfigService>;
  let mailService: { enqueueEmail: jest.Mock };
  let gateway: { sendToUser: jest.Mock };

  const mockNotification: Notification = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'user-123',
    type: NotificationType.KYC_APPROVED,
    title: 'Test Notification',
    body: 'This is a test notification',
    isRead: false,
    data: {},
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    searchVector: null,
    user: {} as any,
  };

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    fcmToken: 'mock-fcm-token',
    fcmTokens: ['mock-fcm-token'],
  } as any;

  const makePreference = (
    notificationType: NotificationType,
    overrides: Partial<NotificationPreference> = {},
  ): NotificationPreference =>
    ({
      id: 'pref-1',
      userId: 'user-123',
      notificationType,
      emailEnabled: true,
      pushEnabled: true,
      inAppEnabled: true,
      digestMode: NotificationDigestMode.IMMEDIATE,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as NotificationPreference;

  beforeEach(async () => {
    const mockNotificationRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockResolvedValue(mockNotification),
      findAndCount: jest.fn().mockResolvedValue([[mockNotification], 1]),
      findOne: jest.fn().mockResolvedValue(mockNotification),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(1),
    };

    preferenceRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      createQueryBuilder: jest.fn(() => ({
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      })),
      findOne: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(makePreference(where.notificationType)),
        ),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    const mockFcmService = {
      sendPush: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'SKIP_EMAIL_SENDING') return 'false';
        if (key === 'JWT_SECRET') return 'test-secret';
        return null;
      }),
    };

    mailService = {
      enqueueEmail: jest.fn().mockResolvedValue(undefined),
    };

    gateway = {
      sendToUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        NotificationPreferenceService,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockNotificationRepo,
        },
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: preferenceRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: FCMService,
          useValue: mockFcmService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MailService,
          useValue: mailService,
        },
        {
          provide: NotificationsGateway,
          useValue: gateway,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    preferenceService = module.get<NotificationPreferenceService>(
      NotificationPreferenceService,
    );
    notificationRepo = module.get(getRepositoryToken(Notification));
    userRepo = module.get(getRepositoryToken(User));
    fcmService = module.get(FCMService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create and save a notification', async () => {
      const result = await service.create(
        'user-123',
        NotificationType.KYC_APPROVED,
        'Title',
        'Body',
      );
      expect(notificationRepo.create).toHaveBeenCalled();
      expect(notificationRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('dispatch (#1512)', () => {
    it('gates in-app, push, and email on isChannelEnabled and batches the preference lookup into one query', async () => {
      const isChannelEnabledSpy = jest.spyOn(
        preferenceService,
        'isChannelEnabled',
      );

      const result = await service.dispatch(
        'user-123',
        NotificationType.KYC_APPROVED,
        'KYC Approved',
        'Your KYC has been approved',
      );

      expect(isChannelEnabledSpy).toHaveBeenCalledWith(
        'user-123',
        NotificationType.KYC_APPROVED,
        'inApp',
      );
      expect(isChannelEnabledSpy).toHaveBeenCalledWith(
        'user-123',
        NotificationType.KYC_APPROVED,
        'push',
      );
      expect(isChannelEnabledSpy).toHaveBeenCalledWith(
        'user-123',
        NotificationType.KYC_APPROVED,
        'email',
      );
      expect(preferenceRepo.findOne).toHaveBeenCalledTimes(1);
      expect(notificationRepo.save).toHaveBeenCalledTimes(1);
      expect(fcmService.sendPush).toHaveBeenCalledTimes(1);
      expect(mailService.enqueueEmail).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('does not enqueue an email when emailEnabled=false for RATE_ALERT_TRIGGERED', async () => {
      preferenceRepo.findOne.mockResolvedValue(
        makePreference(NotificationType.RATE_ALERT_TRIGGERED, {
          emailEnabled: false,
          pushEnabled: true,
          inAppEnabled: true,
        }),
      );

      await service.dispatch(
        'user-123',
        NotificationType.RATE_ALERT_TRIGGERED,
        'Rate Alert',
        'USD/NGN crossed threshold',
      );

      expect(notificationRepo.save).toHaveBeenCalledTimes(1);
      expect(fcmService.sendPush).toHaveBeenCalledTimes(1);
      expect(mailService.enqueueEmail).not.toHaveBeenCalled();
    });

    it('does not send push when pushEnabled=false', async () => {
      preferenceRepo.findOne.mockResolvedValue(
        makePreference(NotificationType.KYC_APPROVED, {
          emailEnabled: true,
          pushEnabled: false,
          inAppEnabled: true,
        }),
      );

      await service.dispatch(
        'user-123',
        NotificationType.KYC_APPROVED,
        'KYC Approved',
        'Your KYC has been approved',
      );

      expect(notificationRepo.save).toHaveBeenCalledTimes(1);
      expect(fcmService.sendPush).not.toHaveBeenCalled();
      expect(mailService.enqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('does not save an in-app record when inAppEnabled=false', async () => {
      preferenceRepo.findOne.mockResolvedValue(
        makePreference(NotificationType.RATE_ALERT_TRIGGERED, {
          emailEnabled: true,
          pushEnabled: true,
          inAppEnabled: false,
        }),
      );

      await service.dispatch(
        'user-123',
        NotificationType.RATE_ALERT_TRIGGERED,
        'Rate Alert',
        'USD/NGN crossed threshold',
      );

      expect(notificationRepo.save).not.toHaveBeenCalled();
      expect(gateway.sendToUser).not.toHaveBeenCalled();
      expect(fcmService.sendPush).toHaveBeenCalledTimes(1);
      expect(mailService.enqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('delivers TRANSACTION notifications across all channels regardless of preferences', async () => {
      preferenceRepo.findOne.mockResolvedValue(
        makePreference(NotificationType.TRANSACTION, {
          emailEnabled: false,
          pushEnabled: false,
          inAppEnabled: false,
        }),
      );

      await service.dispatch(
        'user-123',
        NotificationType.TRANSACTION,
        'Transfer Completed',
        'Your transfer has settled',
      );

      expect(notificationRepo.save).toHaveBeenCalledTimes(1);
      expect(fcmService.sendPush).toHaveBeenCalledTimes(1);
      expect(mailService.enqueueEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      notificationRepo.findOne.mockResolvedValue(mockNotification);
      notificationRepo.save.mockResolvedValue({
        ...mockNotification,
        isRead: true,
      });

      const result = await service.markAsRead('user-123', 'notif-123');
      expect(result.isRead).toBe(true);
    });

    it('should throw NotFoundException if notification does not exist', async () => {
      notificationRepo.findOne.mockResolvedValue(null);

      await expect(service.markAsRead('user-123', 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
