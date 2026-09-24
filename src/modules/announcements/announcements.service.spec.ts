import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnnouncementsService } from './announcements.service';
import {
  Announcement,
  AnnouncementType,
  AnnouncementAudience,
} from './entities/announcement.entity';
import { AnnouncementAcknowledgment } from './entities/announcement-acknowledgment.entity';

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let announcementRepo: Repository<Announcement>;
  let acknowledgmentRepo: Repository<AnnouncementAcknowledgment>;

  const mockAnnouncement: Partial<Announcement> = {
    id: 'test-id',
    title: 'Test Announcement',
    body: 'This is a test announcement',
    type: AnnouncementType.INFO,
    startsAt: new Date('2026-01-01'),
    endsAt: null,
    isActive: true,
    requiresAcknowledgment: false,
    targetAudience: AnnouncementAudience.ALL,
    createdBy: 'admin-id',
    createdAt: new Date(),
  };

  const mockAnnouncementRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockAcknowledgmentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        {
          provide: getRepositoryToken(Announcement),
          useValue: mockAnnouncementRepo,
        },
        {
          provide: getRepositoryToken(AnnouncementAcknowledgment),
          useValue: mockAcknowledgmentRepo,
        },
      ],
    }).compile();

    service = module.get<AnnouncementsService>(AnnouncementsService);
    announcementRepo = module.get(getRepositoryToken(Announcement));
    acknowledgmentRepo = module.get(getRepositoryToken(AnnouncementAcknowledgment));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new announcement', async () => {
      mockAnnouncementRepo.create.mockReturnValue(mockAnnouncement);
      mockAnnouncementRepo.save.mockResolvedValue(mockAnnouncement);

      const result = await service.create(
        {
          title: 'Test Announcement',
          body: 'This is a test announcement',
          startsAt: new Date('2026-01-01'),
        },
        'admin-id',
      );

      expect(result.title).toBe('Test Announcement');
      expect(result.createdBy).toBe('admin-id');
    });
  });

  describe('findActiveForUser', () => {
    it('should return active announcements for ALL audience', async () => {
      mockAnnouncementRepo.find.mockResolvedValue([mockAnnouncement]);
      mockAcknowledgmentRepo.find.mockResolvedValue([]);

      const result = await service.findActiveForUser('user-id', 'USER');

      expect(result).toHaveLength(1);
      expect(result[0].acknowledged).toBe(false);
    });

    it('should filter announcements by audience', async () => {
      const adminAnnouncement = {
        ...mockAnnouncement,
        targetAudience: AnnouncementAudience.ADMINS,
      };
      mockAnnouncementRepo.find.mockResolvedValue([adminAnnouncement]);
      mockAcknowledgmentRepo.find.mockResolvedValue([]);

      const userResult = await service.findActiveForUser('user-id', 'USER');
      expect(userResult).toHaveLength(0);

      const adminResult = await service.findActiveForUser('admin-id', 'ADMIN');
      expect(adminResult).toHaveLength(1);
    });

    it('should mark acknowledged announcements', async () => {
      mockAnnouncementRepo.find.mockResolvedValue([mockAnnouncement]);
      mockAcknowledgmentRepo.find.mockResolvedValue([
        { announcementId: 'test-id' },
      ]);

      const result = await service.findActiveForUser('user-id', 'USER');

      expect(result[0].acknowledged).toBe(true);
    });
  });

  describe('acknowledge', () => {
    it('should acknowledge an announcement', async () => {
      mockAnnouncementRepo.findOne.mockResolvedValue(mockAnnouncement);
      mockAcknowledgmentRepo.findOne.mockResolvedValue(null);
      mockAcknowledgmentRepo.create.mockReturnValue({});
      mockAcknowledgmentRepo.save.mockResolvedValue({});

      const result = await service.acknowledge('test-id', 'user-id');

      expect(result.success).toBe(true);
    });

    it('should be idempotent for duplicate acknowledgments', async () => {
      mockAnnouncementRepo.findOne.mockResolvedValue(mockAnnouncement);
      mockAcknowledgmentRepo.findOne.mockResolvedValue({ id: 'existing' });

      const result = await service.acknowledge('test-id', 'user-id');

      expect(result.success).toBe(true);
      expect(mockAcknowledgmentRepo.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent announcement', async () => {
      mockAnnouncementRepo.findOne.mockResolvedValue(null);

      await expect(
        service.acknowledge('non-existent', 'user-id'),
      ).rejects.toThrow('Announcement not found');
    });
  });

  describe('deactivate', () => {
    it('should deactivate an announcement', async () => {
      mockAnnouncementRepo.findOne.mockResolvedValue({
        ...mockAnnouncement,
        isActive: true,
      });
      mockAnnouncementRepo.save.mockResolvedValue({});

      const result = await service.deactivate('test-id');

      expect(result.success).toBe(true);
    });
  });
});
