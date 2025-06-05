// src/notification-preferences/notification-preferences.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreference } from './entities/notification-preference.entity';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let repository: Repository<NotificationPreference>;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferencesService,
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<NotificationPreferencesService>(NotificationPreferencesService);
    repository = module.get<Repository<NotificationPreference>>(
      getRepositoryToken(NotificationPreference),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByUserId', () => {
    it('should return user preferences if they exist', async () => {
      const userId = 'test-user-id';
      const mockPreferences = {
        id: '1',
        userId,
        notifyOnTx: true,
        notifyOnAnnouncements: false,
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(repository, 'findOne').mockResolvedValue(mockPreferences);

      const result = await service.findByUserId(userId);
      expect(result).toEqual(mockPreferences);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { userId } });
    });

    it('should create default preferences if none exist', async () => {
      const userId = 'test-user-id';
      const mockDefaultPreferences = {
        userId,
        notifyOnTx: true,
        notifyOnAnnouncements: true,
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
      };

      jest.spyOn(repository, 'findOne').mockResolvedValue(null);
      jest.spyOn(repository, 'create').mockReturnValue(mockDefaultPreferences as any);
      jest.spyOn(repository, 'save').mockResolvedValue({
        ...mockDefaultPreferences,
        id: '1',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.findByUserId(userId);
      
      expect(repository.findOne).toHaveBeenCalledWith({ where: { userId } });
      expect(repository.create).toHaveBeenCalledWith(mockDefaultPreferences);
      expect(repository.save).toHaveBeenCalled();
      expect(result).toHaveProperty('userId', userId);
      expect(result).toHaveProperty('notifyOnTx', true);
    });
  });

  describe('update', () => {
    it('should update existing preferences', async () => {
      const userId = 'test-user-id';
      const updateDto = { notifyOnTx: false, emailEnabled: false };
      
      const existingPreferences = {
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
      
      const updatedPreferences = {
        ...existingPreferences,
        ...updateDto,
      };

      jest.spyOn(repository, 'findOne').mockResolvedValue(existingPreferences);
      jest.spyOn(repository, 'save').mockResolvedValue(updatedPreferences);

      const result = await service.update(userId, updateDto);
      
      expect(repository.findOne).toHaveBeenCalledWith({ where: { userId } });
      expect(repository.save).toHaveBeenCalledWith(expect.objectContaining(updateDto));
      expect(result).toEqual(updatedPreferences);
    });
  });
});

