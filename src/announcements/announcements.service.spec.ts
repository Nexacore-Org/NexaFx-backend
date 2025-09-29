import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnnouncementsService } from './announcements.service';
import { Announcement, AnnouncementType } from './entities/announcement.entity';
import { NotFoundException } from '@nestjs/common';

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let repository: Repository<Announcement>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        {
          provide: getRepositoryToken(Announcement),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AnnouncementsService>(AnnouncementsService);
    repository = module.get<Repository<Announcement>>(
      getRepositoryToken(Announcement),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new announcement', async () => {
      const createDto = {
        title: 'Test Announcement',
        message: 'Test Message',
        type: AnnouncementType.INFO,
        startDate: '2025-04-30T00:00:00.000Z',
        endDate: '2025-05-30T00:00:00.000Z',
      };

      const announcement = {
        id: '1',
        ...createDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(announcement);
      mockRepository.save.mockResolvedValue(announcement);

      const result = await service.create(createDto);
      expect(result).toEqual(announcement);
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...createDto,
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      });
    });
  });

  describe('findActive', () => {
    it('should return active announcements', async () => {
      const now = new Date();
      const announcements = [
        {
          id: '1',
          title: 'Active Announcement',
          startDate: new Date(now.getTime() - 86400000), // yesterday
          endDate: new Date(now.getTime() + 86400000), // tomorrow
        },
      ];

      mockRepository.find.mockResolvedValue(announcements);

      const result = await service.findActive();
      expect(result).toEqual(announcements);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          startDate: expect.any(Object),
          endDate: expect.any(Object),
        },
        order: {
          createdAt: 'DESC',
        },
      });
    });
  });

  describe('update', () => {
    it('should update an existing announcement', async () => {
      const id = '1';
      const updateDto = {
        title: 'Updated Title',
      };

      const existingAnnouncement = {
        id,
        title: 'Old Title',
        message: 'Test Message',
        type: AnnouncementType.INFO,
        startDate: new Date(),
        endDate: new Date(),
      };

      const updatedAnnouncement = {
        ...existingAnnouncement,
        ...updateDto,
      };

      mockRepository.findOne.mockResolvedValue(existingAnnouncement);
      mockRepository.save.mockResolvedValue(updatedAnnouncement);

      const result = await service.update(id, updateDto);
      expect(result).toEqual(updatedAnnouncement);
    });

    it('should throw NotFoundException when announcement not found', async () => {
      const id = 'non-existent';
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(id, {})).rejects.toThrow(NotFoundException);
    });
  });
});
