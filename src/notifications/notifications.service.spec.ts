jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const tokenFor = (entity: { name?: string } | string) =>
    `${typeof entity === 'string' ? entity : (entity?.name ?? 'Entity')}Repository`;
  return {
    InjectRepository: (entity: { name?: string } | string) =>
      Inject(tokenFor(entity)),
    getRepositoryToken: tokenFor,
  };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
  ApiTags: () => () => undefined,
  ApiBearerAuth: () => () => undefined,
  ApiOperation: () => () => undefined,
  ApiResponse: () => () => undefined,
}));

jest.mock('@nestjs/websockets', () => ({
  WebSocketGateway: () => () => undefined,
  WebSocketServer: () => () => undefined,
  SubscribeMessage: () => () => undefined,
}));

jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
  Processor: () => () => undefined,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationsService,
  NOTIFICATION_EVENT,
} from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { Notification, NotificationType } from './entities/notification.entity';
import { User } from '../users/user.entity';
import { FCMService } from '../firebase/fcm.service';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../modules/mail/mail.service';
import { NotFoundException } from '@nestjs/common';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepo: jest.Mocked<Repository<Notification>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let fcmService: jest.Mocked<FCMService>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let configService: jest.Mocked<ConfigService>;
  let gateway: NotificationsGateway;
  let roomEmitMock: jest.Mock;
  let serverToMock: jest.Mock;

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
        return null;
      }),
    };

    const mockMailService = {
      enqueueEmail: jest.fn().mockResolvedValue(undefined),
    };

    roomEmitMock = jest.fn();
    serverToMock = jest.fn().mockReturnValue({ emit: roomEmitMock });
    gateway = new NotificationsGateway({ verifyAsync: jest.fn() } as any);
    gateway.server = { to: serverToMock } as any;

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
          useValue: mockMailService,
        },
        {
          provide: NotificationsGateway,
          useValue: gateway,
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
    it('should create and save a notification and emit the "notification" event to user:<id>', async () => {
      const sendToUserSpy = jest.spyOn(gateway, 'sendToUser');

      const result = await service.create(
        'user-123',
        NotificationType.SYSTEM,
        'Title',
        'Body',
      );

      expect(notificationRepo.create).toHaveBeenCalled();
      expect(notificationRepo.save).toHaveBeenCalled();
      expect(result).toBe(mockNotification);
      expect(NOTIFICATION_EVENT).toBe('notification');
      expect(sendToUserSpy).toHaveBeenCalledWith(
        'user-123',
        'notification',
        mockNotification,
      );
      expect(serverToMock).toHaveBeenCalledWith('user:user-123');
      expect(roomEmitMock).toHaveBeenCalledWith(
        'notification',
        mockNotification,
      );
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
        expect.objectContaining({
          deepLink: expect.any(String),
        }),
      );
      expect(serverToMock).toHaveBeenCalledWith('user:user-123');
      expect(roomEmitMock).toHaveBeenCalledWith(
        'notification',
        mockNotification,
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
