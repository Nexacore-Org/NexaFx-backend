import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import {
  Notification,
  NotificationType,
  NotificationStatus,
} from './entities/notification.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationDigestMode } from './entities/notification-preference.entity';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repository: jest.Mocked<Repository<Notification>>;

  const mockNotification: Notification = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: '550e8400-e29b-41d4-a716-446655440001',
    type: NotificationType.SYSTEM,
    title: 'Test Notification',
    message: 'This is a test notification',
    status: NotificationStatus.UNREAD,
    metadata: {},
    relatedId: undefined,
    actionUrl: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    readAt: undefined,
    searchVector: null,
    user: {} as any,
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    countBy: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<Notification>>;

  const mockPreferenceService = {
    getPreference: jest.fn(),
    isChannelEnabled: jest.fn(),
    generateUnsubscribeToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockRepository,
        },
        {
          provide: NotificationPreferenceService,
          useValue: mockPreferenceService,
        },
      ],
    }).compile();

    service = module.get(NotificationsService);
    repository = module.get(getRepositoryToken(Notification));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a notification', async () => {
      mockPreferenceService.getPreference.mockResolvedValue({
        digestMode: NotificationDigestMode.IMMEDIATE,
      });
      mockPreferenceService.isChannelEnabled.mockResolvedValue(true);
      repository.create.mockReturnValue(mockNotification);
      repository.save.mockResolvedValue(mockNotification);

      const result = await service.create({
        userId: mockNotification.userId,
        type: NotificationType.SYSTEM,
        title: 'Test',
        message: 'Test message',
      });

      expect(result).toMatchObject({ title: 'Test Notification' });
    });

    it('should return null when in-app channel is disabled', async () => {
      mockPreferenceService.getPreference.mockResolvedValue({
        digestMode: NotificationDigestMode.IMMEDIATE,
      });
      mockPreferenceService.isChannelEnabled.mockResolvedValue(false);

      const result = await service.create({
        userId: mockNotification.userId,
        type: NotificationType.SYSTEM,
        title: 'Test',
        message: 'Test message',
      });

      expect(result).toBeNull();
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on error', async () => {
      mockPreferenceService.getPreference.mockResolvedValue({
        digestMode: NotificationDigestMode.IMMEDIATE,
      });
      mockPreferenceService.isChannelEnabled.mockResolvedValue(true);
      repository.create.mockImplementation(() => {
        throw new Error();
      });

      await expect(
        service.create({
          userId: 'id',
          type: NotificationType.SYSTEM,
          title: 't',
          message: 'm',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated notifications', async () => {
      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockNotification]),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll('user-id', 1, 10);

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark as read', async () => {
      repository.findOne.mockResolvedValue(mockNotification);
      repository.save.mockResolvedValue({
        ...mockNotification,
        status: NotificationStatus.READ,
      });

      const result = await service.markAsRead(mockNotification.id);
      expect(result.status).toBe(NotificationStatus.READ);
    });

    it('should throw NotFoundException if not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.markAsRead('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
