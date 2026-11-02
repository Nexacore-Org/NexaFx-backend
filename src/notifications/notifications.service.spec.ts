import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { User } from '../users/user.entity';
import { FCMService } from '../firebase/fcm.service';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { MailService } from '../modules/mail/mail.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationPreferenceService } from './services/notification-preference.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepo: jest.Mocked<Repository<Notification>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let fcmService: jest.Mocked<FCMService>;
  let configService: jest.Mocked<ConfigService>;
  let mailService: { enqueueEmail: jest.Mock };
  let preferenceService: { generateUnsubscribeToken: jest.Mock };

  const mockNotification: Notification = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'user-123',
    type: NotificationType.SYSTEM,
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
    notificationPreferences: {
      email: true,
      push: true,
      types: { TRANSACTION: true, KYC: true, RATE_ALERT: true },
    },
  } as any;

  beforeEach(async () => {
    const mockNotificationRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockResolvedValue(mockNotification),
      findAndCount: jest.fn().mockResolvedValue([[mockNotification], 1]),
      findOne: jest.fn().mockResolvedValue(mockNotification),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(1),
    };

    const mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    const mockFcmService = {
      sendPush: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'SKIP_EMAIL_SENDING') return 'true';
        if (key === 'APP_URL') return 'https://api.nexafx.io';
        return null;
      }),
    };

    mailService = {
      enqueueEmail: jest.fn().mockResolvedValue(undefined),
    };

    preferenceService = {
      generateUnsubscribeToken: jest
        .fn()
        .mockReturnValue('signed-unsub-token-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockNotificationRepo,
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
          useValue: { sendToUser: jest.fn() },
        },
        {
          provide: NotificationPreferenceService,
          useValue: preferenceService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
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
        NotificationType.SYSTEM,
        'Title',
        'Body',
      );
      expect(notificationRepo.create).toHaveBeenCalled();
      expect(notificationRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('dispatch', () => {
    it('should dispatch, saving and calling sendPush when preferences are enabled', async () => {
      const result = await service.dispatch(
        'user-123',
        NotificationType.KYC,
        'KYC Approved',
        'Your KYC has been approved',
      );

      expect(notificationRepo.save).toHaveBeenCalled();
      expect(fcmService.sendPush).toHaveBeenCalledWith(
        'user-123',
        'KYC Approved',
        'Your KYC has been approved',
        undefined,
      );
      expect(result).toBeDefined();
    });

    it('should not send push if push preference is disabled', async () => {
      userRepo.findOne.mockResolvedValue({
        ...mockUser,
        notificationPreferences: {
          email: true,
          push: false,
          types: { TRANSACTION: true, KYC: true, RATE_ALERT: true },
        },
      });

      await service.dispatch(
        'user-123',
        NotificationType.KYC,
        'KYC Approved',
        'Your KYC has been approved',
      );

      expect(fcmService.sendPush).not.toHaveBeenCalled();
    });

    it('includes an unsubscribe URL and List-Unsubscribe headers in notification emails (#1514)', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SKIP_EMAIL_SENDING') return 'false';
        if (key === 'APP_URL') return 'https://api.nexafx.io';
        return null;
      });

      await service.dispatch(
        'user-123',
        NotificationType.KYC,
        'KYC Approved',
        'Your KYC has been approved',
      );

      expect(preferenceService.generateUnsubscribeToken).toHaveBeenCalledWith(
        'user-123',
        NotificationType.KYC,
      );
      expect(mailService.enqueueEmail).toHaveBeenCalledTimes(1);

      const emailJob = mailService.enqueueEmail.mock.calls[0][0];
      const expectedUrl =
        'https://api.nexafx.io/v1/notifications/unsubscribe?token=signed-unsub-token-123';

      expect(emailJob.to).toBe('test@example.com');
      expect(emailJob.html).toContain(expectedUrl);
      expect(emailJob.text).toContain(expectedUrl);
      expect(emailJob.headers).toEqual({
        'List-Unsubscribe': `<${expectedUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      });
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
