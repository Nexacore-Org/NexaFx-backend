import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification } from './entities/notification.entity';
import { BadRequestException } from '@nestjs/common';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: NotificationsService;

  const mockNotification = {
    id: 'e3c69c24-25fb-432d-b3c3-39cf1346bb71',
    userId: '12345678-1234-1234-1234-1234567890ab',
    type: 'SYSTEM',
    category: 'INFO',
    title: 'Test Notification',
    message: 'This is a test notification',
    isRead: false,
    priority: 'MEDIUM',
    channel: 'IN_APP',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue(mockNotification),
            findUnread: jest.fn().mockResolvedValue([mockNotification]),
            markAsRead: jest.fn().mockResolvedValue(undefined),
            markAllAsReadForUser: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create notification', () => {
    it('should create a new notification', async () => {
      const createNotificationDto = new CreateNotificationDto();

      const result = await controller.create(createNotificationDto);

      expect(result).toEqual(mockNotification);
      expect(service.create).toHaveBeenCalledWith(createNotificationDto);
    });

    it('should throw BadRequestException if invalid data is provided', async () => {
      const createNotificationDto = new CreateNotificationDto();

      expect(await controller.create(createNotificationDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('find unread notifications', () => {
    it('should return a list of unread notifications for a user', async () => {
      const userId = '12345678-1234-1234-1234-1234567890ab';
      const result = await controller.findUnread(userId);

      expect(result).toEqual([mockNotification]);
      expect(service.findUnread).toHaveBeenCalledWith(userId);
    });

    it('should throw an error if no notifications are found', async () => {
      jest.spyOn(service, 'findUnread').mockResolvedValueOnce([]); // No notifications found

      const userId = 'nonexistent-user-id';
      const result = await controller.findUnread(userId);

      expect(result).toEqual([]);
    });
  });

  describe('mark notification as read', () => {
    it('should mark a single notification as read', async () => {
      const notificationId = mockNotification.id;
      await controller.markAsRead(notificationId);

      expect(service.markAsRead).toHaveBeenCalledWith(notificationId);
    });
  });

  describe('mark all notifications as read for a user', () => {
    it('should mark all notifications as read for the user', async () => {
      const userId = mockNotification.userId;
      await controller.markAllAsRead(userId);

      expect(service.markAllAsReadForUser).toHaveBeenCalledWith(userId);
    });
  });
});
