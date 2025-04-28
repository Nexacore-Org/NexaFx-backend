import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';
import { Notification } from './notification.entity';
import { NotificationChannel } from './enums/notificationChannel.enum';
import { NotificationType } from './enums/notificationType.enum';

describe('NotificationService', () => {
  let service: NotificationService;
  let notificationRepository: Repository<Notification>;
  let emailService: EmailService;
  let eventEmitter: EventEmitter2;

  const mockNotificationRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };

  const mockEmailService = {
    sendEmail: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockNotificationRepository,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    notificationRepository = module.get<Repository<Notification>>(
      getRepositoryToken(Notification),
    );
    emailService = module.get<EmailService>(EmailService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createNotification', () => {
    it('should create a notification and send an email', async () => {
      const userId = 'user-123';
      const notificationPayload = {
        userId,
        type: NotificationType.SWAP_COMPLETED,
        title: 'Swap Completed',
        content: 'Your swap has been completed',
        channel: NotificationChannel.BOTH,
        metadata: { swapId: 'swap-123' },
      };

      const mockNotification = {
        id: 'notification-123',
        ...notificationPayload,
        metadata: JSON.stringify(notificationPayload.metadata),
        isRead: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockNotificationRepository.create.mockReturnValue(mockNotification);
      mockNotificationRepository.save.mockResolvedValue(mockNotification);

      // Mock the private method getUserEmail
      jest
        .spyOn(service as any, 'getUserEmail')
        .mockResolvedValue('user@example.com');

      // Mock the private method getTemplateForNotificationType
      jest
        .spyOn(service as any, 'getTemplateForNotificationType')
        .mockReturnValue('swap-completed');

      mockEmailService.sendEmail.mockResolvedValue(true);

      const result = await service.createNotification(notificationPayload);

      expect(mockNotificationRepository.create).toHaveBeenCalledWith({
        userId,
        type: NotificationType.SWAP_COMPLETED,
        title: 'Swap Completed',
        content: 'Your swap has been completed',
        channel: NotificationChannel.BOTH,
        metadata: JSON.stringify({ swapId: 'swap-123' }),
      });

      expect(mockNotificationRepository.save).toHaveBeenCalledWith(
        mockNotification,
      );
      expect(result).toEqual(mockNotification);

      // Verify email was sent
      expect(mockEmailService.sendEmail).toHaveBeenCalled();
    });
  });

  describe('getUnreadNotifications', () => {
    it('should return unread notifications for a user', async () => {
      const userId = 'user-123';
      const mockNotifications = [
        {
          id: 'notification-1',
          userId,
          type: NotificationType.SWAP_COMPLETED,
          title: 'Notification 1',
          content: 'Content 1',
          isRead: false,
        },
        {
          id: 'notification-2',
          userId,
          type: NotificationType.WALLET_UPDATED,
          title: 'Notification 2',
          content: 'Content 2',
          isRead: false,
        },
      ];

      mockNotificationRepository.find.mockResolvedValue(mockNotifications);

      const result = await service.getUnreadNotifications(userId);

      expect(mockNotificationRepository.find).toHaveBeenCalledWith({
        where: {
          userId,
          isRead: false,
          isActive: true,
          channel: [NotificationChannel.IN_APP, NotificationChannel.BOTH],
        },
        order: {
          createdAt: 'DESC',
        },
      });

      expect(result).toEqual(mockNotifications);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      const notificationId = 'notification-123';
      const userId = 'user-123';

      mockNotificationRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.markAsRead(notificationId, userId);

      expect(mockNotificationRepository.update).toHaveBeenCalledWith(
        { id: notificationId, userId },
        { isRead: true },
      );

      expect(result).toBe(true);
    });

    it('should return false if notification was not found', async () => {
      const notificationId = 'notification-123';
      const userId = 'user-123';

      mockNotificationRepository.update.mockResolvedValue({ affected: 0 });

      const result = await service.markAsRead(notificationId, userId);

      expect(result).toBe(false);
    });
  });

  describe('Event handlers', () => {
    it('should handle swap.completed event', async () => {
      const swapEvent = {
        userId: 'user-123',
        swapId: 'swap-123',
        fromAsset: 'BTC',
        toAsset: 'ETH',
        fromAmount: 0.1,
        toAmount: 1.5,
        timestamp: new Date(),
      };

      jest
        .spyOn(service, 'createNotification')
        .mockResolvedValue({} as Notification);

      await service.handleSwapCompletedEvent(swapEvent);

      expect(service.createNotification).toHaveBeenCalledWith({
        userId: 'user-123',
        type: NotificationType.SWAP_COMPLETED,
        title: 'Swap Completed Successfully',
        content: `Your swap of 0.1 BTC to 1.5 ETH has been completed successfully.`,
        metadata: {
          swapId: 'swap-123',
          fromAsset: 'BTC',
          toAsset: 'ETH',
          fromAmount: 0.1,
          toAmount: 1.5,
        },
      });
    });
  });
});
