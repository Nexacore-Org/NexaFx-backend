import { Test, TestingModule } from '@nestjs/testing';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences.service';
import { BadRequestException } from '@nestjs/common';

describe('NotificationPreferencesController', () => {
  let controller: NotificationPreferencesController;
  let service: NotificationPreferencesService;

  const mockService = {
    create: jest.fn(),
    findByUserId: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationPreferencesController],
      providers: [
        {
          provide: NotificationPreferencesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<NotificationPreferencesController>(NotificationPreferencesController);
    service = module.get<NotificationPreferencesService>(NotificationPreferencesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findMine', () => {
    it('should return user preferences', async () => {
      const userId = 'test-user-id';
      const mockPreferences = {
        id: '1',
        userId,
        notifyOnTx: true,
        notifyOnAnnouncements: true,
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(service, 'findByUserId').mockResolvedValue(mockPreferences);

      const result = await controller.findMine({ user: { id: userId } });
      
      expect(service.findByUserId).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockPreferences);
    });
  });

  describe('updateMine', () => {
    it('should update user preferences', async () => {
      const userId = 'test-user-id';
      const updateDto = { notifyOnTx: false, emailEnabled: false };
      
      const updatedPreferences = {
        id: '1',
        userId,
        notifyOnTx: false,
        notifyOnAnnouncements: true,
        emailEnabled: false,
        smsEnabled: false,
        pushEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(service, 'update').mockResolvedValue(updatedPreferences);

      const result = await controller.updateMine(updateDto, { user: { id: userId } });
      
      expect(service.update).toHaveBeenCalledWith(userId, updateDto);
      expect(result).toEqual(updatedPreferences);
    });
  });

  describe('create', () => {
    it('should reject if user is not admin', async () => {
      const createDto = { userId: 'another-user-id' };
      const req = { user: { id: 'test-user-id', isAdmin: false } };

      await expect(controller.create(createDto, req)).rejects.toThrow(BadRequestException);
    });

    it('should create preferences if user is admin', async () => {
      const createDto = { userId: 'another-user-id' };
      const req = { user: { id: 'test-user-id', isAdmin: true } };
      
      const createdPreferences = {
        id: '1',
        ...createDto,
        notifyOnTx: true,
        notifyOnAnnouncements: true,
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(service, 'create').mockResolvedValue(createdPreferences);

      const result = await controller.create(createDto, req);
      
      expect(service.create).toHaveBeenCalledWith(createDto);
      expect(result).toEqual(createdPreferences);
    });
  });
});