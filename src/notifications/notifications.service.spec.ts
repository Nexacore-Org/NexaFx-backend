import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType, NotificationStatus } from './entities/notification.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals'; // Import jest to declare it

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repository: Repository<Notification>;

  const mockNotification: Notification = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: '550e8400-e29b-41d4-a716-446655440001',
    type: NotificationType.SYSTEM,
    title: 'Test Notification',
    message: 'This is a test notification',
    status: NotificationStatus.UNREAD,
    metadata: {},
    relatedId: null,
    actionUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    readAt: null,
    user: null,
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findBy: jest.fn(),
    countBy: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    repository = module.get<Repository<Notification>>(
      getRepositoryToken(Notification),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a notification successfully', async () => {
      const createDto = {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        type: NotificationType.SYSTEM,
        title: 'Test',
        message: 'Test message',
      };

      mockRepository.create.mockReturnValue(mockNotification);
      mockRepository.save.mockResolvedValue(mockNotification);

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(result.title).toBe('Test');
      expect(mockRepository.create).toHaveBeenCalledWith(createDto);
    });

    it('should throw BadRequestException on creation failure', async () => {
      mockRepository.create.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(
        service.create({
          userId: 'test-id',
          type: NotificationType.SYSTEM,
          title: 'Test',
          message: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated notifications', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockNotification]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll('user-id', 1, 20);

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const readNotification = { ...mockNotification, status: NotificationStatus.READ };
      mockRepository.findOne.mockResolvedValue(mockNotification);
      mockRepository.save.mockResolvedValue(readNotification);

      const result = await service.markAsRead(mockNotification.id);

      expect(result.status).toBe(NotificationStatus.READ);
      expect(result.readAt).toBeDefined();
    });

    it('should throw NotFoundException if notification does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.markAsRead('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('should delete a notification', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.delete(mockNotification.id);

      expect(result.success).toBe(true);
      expect(mockRepository.delete).toHaveBeenCalledWith(mockNotification.id);
    });

    it('should throw NotFoundException if notification does not exist', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.delete('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
