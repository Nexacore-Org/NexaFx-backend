import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { ActivityLogService } from './activity-log.service';
import { ActivityLog } from '../entities/activity-log.entity';
import { CreateActivityLogDto } from '../dto/create-activity-log.dto';
import { Request } from 'express';

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  let repository: jest.Mocked<Repository<ActivityLog>>;

  const mockActivityLog = {
    id: 'activity-123',
    userId: 'user-123',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    deviceType: 'Desktop',
    browser: 'Chrome 120.0.0.0',
    operatingSystem: 'Windows 10',
    location: 'Lagos, Nigeria',
    sessionToken: 'session-token-123',
    loggedInAt: new Date(),
    loggedOutAt: null,
    isActive: true,
    activityType: 'LOGIN',
    metadata: { loginMethod: '2FA' },
    createdAt: new Date(),
    updatedAt: new Date(),
    save: jest.fn(),
  };

  const mockRequest = {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'x-forwarded-for': '192.168.1.1',
      'x-real-ip': '192.168.1.1',
    },
    connection: { remoteAddress: '192.168.1.1' },
    socket: { remoteAddress: '192.168.1.1' },
  } as any;

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogService,
        {
          provide: getRepositoryToken(ActivityLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ActivityLogService>(ActivityLogService);
    repository = module.get(getRepositoryToken(ActivityLog));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createActivityLog', () => {
    const createDto: CreateActivityLogDto = {
      userId: 'user-123',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      deviceType: 'Desktop',
      browser: 'Chrome',
      operatingSystem: 'Windows',
      activityType: 'LOGIN',
    };

    it('should create activity log successfully', async () => {
      repository.create.mockReturnValue(mockActivityLog as any);
      repository.save.mockResolvedValue(mockActivityLog as any);

      const result = await service.createActivityLog(createDto);

      expect(repository.create).toHaveBeenCalledWith({
        ...createDto,
        loggedInAt: expect.any(Date),
        isActive: true,
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockActivityLog);
    });

    it('should handle creation errors', async () => {
      repository.create.mockReturnValue(mockActivityLog as any);
      repository.save.mockRejectedValue(new Error('Database error'));

      await expect(service.createActivityLog(createDto)).rejects.toThrow('Database error');
    });
  });

  describe('logLoginActivity', () => {
    it('should log login activity successfully', async () => {
      repository.create.mockReturnValue(mockActivityLog as any);
      repository.save.mockResolvedValue(mockActivityLog as any);

      const result = await service.logLoginActivity('user-123', mockRequest, 'session-token-123');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          deviceType: 'Desktop',
          browser: 'Chrome 120.0.0.0',
          operatingSystem: 'Windows 10',
          sessionToken: 'session-token-123',
          activityType: 'LOGIN',
        })
      );
      expect(result).toEqual(mockActivityLog);
    });

    it('should handle missing user agent', async () => {
      const requestWithoutUserAgent = { ...mockRequest, headers: {} };
      repository.create.mockReturnValue(mockActivityLog as any);
      repository.save.mockResolvedValue(mockActivityLog as any);

      const result = await service.logLoginActivity('user-123', requestWithoutUserAgent);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'Unknown',
        })
      );
      expect(result).toEqual(mockActivityLog);
    });
  });

  describe('logLogoutActivity', () => {
    it('should log logout activity with session ID', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.logLogoutActivity('user-123', 'session-123');

      expect(repository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(ActivityLog);
      expect(mockQueryBuilder.set).toHaveBeenCalledWith({
        isActive: false,
        loggedOutAt: expect.any(Date),
        activityType: 'LOGOUT',
      });
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should log logout activity with request', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.logLogoutActivity('user-123', undefined, mockRequest);

      expect(repository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('ipAddress = :ipAddress', { ipAddress: '192.168.1.1' });
    });
  });

  describe('getUserSessions', () => {
    it('should return user sessions successfully', async () => {
      const sessions = [mockActivityLog];
      repository.find.mockResolvedValue(sessions as any);

      const result = await service.getUserSessions('user-123', 'session-123');

      expect(repository.find).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          isActive: true,
        },
        order: {
          loggedInAt: 'DESC',
        },
      });
      expect(result.sessions).toHaveLength(1);
      expect(result.totalActiveSessions).toBe(1);
      expect(result.currentSessionId).toBe('session-123');
      expect(result.sessions[0].isCurrentSession).toBe(true);
    });

    it('should handle empty sessions', async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.getUserSessions('user-123');

      expect(result.sessions).toHaveLength(0);
      expect(result.totalActiveSessions).toBe(0);
      expect(result.currentSessionId).toBe('');
    });
  });

  describe('logoutOtherSessions', () => {
    it('should logout other sessions successfully', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.logoutOtherSessions('user-123', 'current-session');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('id != :currentSessionId', { currentSessionId: 'current-session' });
      expect(result.message).toBe('Successfully logged out from other devices');
      expect(result.sessionsTerminated).toBe(2);
    });
  });

  describe('logoutAllSessions', () => {
    it('should logout all sessions successfully', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 3 }),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.logoutAllSessions('user-123');

      expect(result.message).toBe('Successfully logged out from all devices');
      expect(result.sessionsTerminated).toBe(3);
    });
  });

  describe('getUserActivityHistory', () => {
    it('should return activity history with pagination', async () => {
      const activities = [mockActivityLog];
      repository.findAndCount.mockResolvedValue([activities, 1] as any);

      const result = await service.getUserActivityHistory('user-123', 1, 20);

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        order: { loggedInAt: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(result.activities).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should handle custom pagination', async () => {
      repository.findAndCount.mockResolvedValue([[], 0] as any);

      const result = await service.getUserActivityHistory('user-123', 2, 10);

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        order: { loggedInAt: 'DESC' },
        skip: 10,
        take: 10,
      });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });
  });

  describe('checkSuspiciousActivity', () => {
    it('should return false for known IP address', async () => {
      repository.findOne.mockResolvedValue(mockActivityLog as any);
      repository.count.mockResolvedValue(5);

      const result = await service.checkSuspiciousActivity('user-123', '192.168.1.1');

      expect(result).toBe(false);
    });

    it('should return true for new IP address', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.count.mockResolvedValue(5);

      const result = await service.checkSuspiciousActivity('user-123', '10.0.0.1');

      expect(result).toBe(true);
    });

    it('should return true for too many recent logins', async () => {
      repository.findOne.mockResolvedValue(mockActivityLog as any);
      repository.count.mockResolvedValue(15);

      const result = await service.checkSuspiciousActivity('user-123', '192.168.1.1');

      expect(result).toBe(true);
    });
  });

  describe('cleanupOldSessions', () => {
    it('should cleanup old sessions successfully', async () => {
      repository.delete.mockResolvedValue({ affected: 5 } as any);

      const result = await service.cleanupOldSessions(30);

      expect(repository.delete).toHaveBeenCalledWith({
        isActive: false,
        loggedOutAt: Not(IsNull()),
      });
      expect(result).toBe(5);
    });
  });

  describe('extractIpAddress', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = {
        headers: {
          'x-forwarded-for': '203.0.113.1, 192.168.1.1',
        },
      } as any;

      const result = service['extractIpAddress'](request);
      expect(result).toBe('203.0.113.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const request = {
        headers: {
          'x-real-ip': '10.0.0.1',
        },
      } as any;

      const result = service['extractIpAddress'](request);
      expect(result).toBe('10.0.0.1');
    });

    it('should extract IP from connection remoteAddress', () => {
      const request = {
        connection: { remoteAddress: '192.168.1.100' },
      } as any;

      const result = service['extractIpAddress'](request);
      expect(result).toBe('192.168.1.100');
    });

    it('should return Unknown when no IP is available', () => {
      const request = {} as any;

      const result = service['extractIpAddress'](request);
      expect(result).toBe('Unknown');
    });
  });

  describe('parseUserAgent', () => {
    it('should parse user agent successfully', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

      const result = service['parseUserAgent'](userAgent);

      expect(result.deviceType).toBe('Desktop');
      expect(result.browser).toContain('Chrome');
      expect(result.os).toContain('Windows');
    });

    it('should handle unknown user agent', () => {
      const result = service['parseUserAgent']('Unknown');

      expect(result.deviceType).toBe('Unknown');
      expect(result.browser).toBe('Unknown');
      expect(result.os).toBe('Unknown');
    });
  });

  describe('logActivity', () => {
    it('should log activity successfully', async () => {
      repository.create.mockReturnValue(mockActivityLog as any);
      repository.save.mockResolvedValue(mockActivityLog as any);

      const result = await service.logActivity('user-123', mockRequest, 'CUSTOM_ACTION', { custom: 'data' });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          activityType: 'CUSTOM_ACTION',
          metadata: { custom: 'data' },
        })
      );
      expect(result).toEqual(mockActivityLog);
    });

    it('should handle anonymous user', async () => {
      repository.create.mockReturnValue(mockActivityLog as any);
      repository.save.mockResolvedValue(mockActivityLog as any);

      const result = await service.logActivity(null, mockRequest, 'ANONYMOUS_ACTION');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'anonymous',
          activityType: 'ANONYMOUS_ACTION',
        })
      );
      expect(result).toEqual(mockActivityLog);
    });
  });
});
