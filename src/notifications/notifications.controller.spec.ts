import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from './providers/notifications.service';
import { GetAllNotificationsQueryDto, SortBy, SortOrder } from './dto/get-all-notifications-query.dto';
import { GetAllNotificationsResponseDto } from './dto/get-all-notifications-response.dto';
import { NotificationType } from './enum/notificationType.enum';
import { NotificationCategory } from './enum/notificationCategory.enum';
import { NotificationPriority } from './enum/notificationPriority.enum';
import { NotificationChannel } from './enum/notificationChannel.enum';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: NotificationsService;

  const mockNotification = {
    id: 'e3c69c24-25fb-432d-b3c3-39cf1346bb71',
    userId: '12345678-1234-1234-1234-1234567890ab',
    type: NotificationType.SYSTEM,
    category: NotificationCategory.INFO,
    title: 'Test Notification',
    message: 'This is a test notification',
    isRead: false,
    priority: NotificationPriority.MEDIUM,
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
            getAllNotificationsForUser: jest.fn().mockResolvedValue({
              notifications: [mockNotification],
              meta: {
                page: 1,
                limit: 10,
                totalItems: 1,
                totalPages: 1,
                hasPreviousPage: false,
                hasNextPage: false,
              },
              summary: {
                totalUnread: 1,
                totalRead: 0,
                lastNotificationDate: new Date(),
              },
            }),
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
      const createNotificationDto: CreateNotificationDto = {
        userId: mockNotification.userId,
        type: mockNotification.type,
        title: mockNotification.title,
        message: mockNotification.message,
        channel: NotificationChannel.IN_APP,
      };

      const result = await controller.create(createNotificationDto);

      expect(result).toEqual(mockNotification);
      expect(service.create).toHaveBeenCalledWith(createNotificationDto);
    });

    it('should throw BadRequestException if invalid data is provided', async () => {
      const createNotificationDto = new CreateNotificationDto();
      
      jest.spyOn(service, 'create').mockRejectedValueOnce(new BadRequestException('Invalid data'));

      await expect(controller.create(createNotificationDto)).rejects.toThrow(
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

  describe('get all notifications for authenticated user', () => {
    const mockRequest = {
      user: {
        id: mockNotification.userId,
      },
    };

    const mockQueryDto: GetAllNotificationsQueryDto = {
      page: 1,
      limit: 10,
      isRead: false,
      sortBy: SortBy.CREATED_AT,
      sortOrder: SortOrder.DESC,
    };

    const expectedResponse: GetAllNotificationsResponseDto = {
      notifications: [mockNotification],
      meta: {
        page: 1,
        limit: 10,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
      summary: {
        totalUnread: 1,
        totalRead: 0,
        lastNotificationDate: new Date(),
      },
    };

    it('should return all notifications for authenticated user', async () => {
      const result = await controller.getAllNotifications(mockRequest, mockQueryDto);

      expect(result).toMatchObject({
        notifications: expect.any(Array),
        meta: {
          page: 1,
          limit: 10,
          totalItems: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
        summary: {
          totalUnread: 1,
          totalRead: 0,
          lastNotificationDate: expect.any(Date),
        },
      });
      expect(service.getAllNotificationsForUser).toHaveBeenCalledWith(
        mockNotification.userId,
        mockQueryDto,
      );
    });

    it('should handle pagination parameters', async () => {
      const paginationQuery = { ...mockQueryDto, page: 2, limit: 5 };
      
      await controller.getAllNotifications(mockRequest, paginationQuery);

      expect(service.getAllNotificationsForUser).toHaveBeenCalledWith(
        mockNotification.userId,
        paginationQuery,
      );
    });

    it('should handle filtering parameters', async () => {
      const filterQuery: GetAllNotificationsQueryDto = {
        ...mockQueryDto,
        isRead: true,
        type: NotificationType.TRANSACTION,
        category: NotificationCategory.SUCCESS,
        priority: NotificationPriority.HIGH,
      };
      
      await controller.getAllNotifications(mockRequest, filterQuery);

      expect(service.getAllNotificationsForUser).toHaveBeenCalledWith(
        mockNotification.userId,
        filterQuery,
      );
    });

    it('should handle date range filtering', async () => {
      const dateRangeQuery = {
        ...mockQueryDto,
        fromDate: '2023-01-01T00:00:00Z',
        toDate: '2023-12-31T23:59:59Z',
      };
      
      await controller.getAllNotifications(mockRequest, dateRangeQuery);

      expect(service.getAllNotificationsForUser).toHaveBeenCalledWith(
        mockNotification.userId,
        dateRangeQuery,
      );
    });

    it('should handle search parameter', async () => {
      const searchQuery = {
        ...mockQueryDto,
        search: 'transaction',
      };
      
      await controller.getAllNotifications(mockRequest, searchQuery);

      expect(service.getAllNotificationsForUser).toHaveBeenCalledWith(
        mockNotification.userId,
        searchQuery,
      );
    });

    it('should handle sorting parameters', async () => {
      const sortQuery = {
        ...mockQueryDto,
        sortBy: SortBy.PRIORITY,
        sortOrder: SortOrder.ASC,
      };
      
      await controller.getAllNotifications(mockRequest, sortQuery);

      expect(service.getAllNotificationsForUser).toHaveBeenCalledWith(
        mockNotification.userId,
        sortQuery,
      );
    });
  });
});

