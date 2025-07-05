import { Test, TestingModule } from '@nestjs/testing';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from '../providers/activity-log.service';
import { Request } from 'express';

describe('ActivityLogController', () => {
  let controller: ActivityLogController;
  let service: jest.Mocked<ActivityLogService>;

  const mockUser = { id: 'user-123', sessionId: 'session-123' };
  const mockRequest = {
    user: mockUser,
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'x-forwarded-for': '192.168.1.1',
    },
    connection: { remoteAddress: '192.168.1.1' },
    socket: { remoteAddress: '192.168.1.1' },
  } as any;

  beforeEach(async () => {
    const mockService = {
      getUserSessions: jest.fn(),
      getUserActivityHistory: jest.fn(),
      logoutOtherSessions: jest.fn(),
      logoutAllSessions: jest.fn(),
      logLogoutActivity: jest.fn(),
      checkSuspiciousActivity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivityLogController],
      providers: [
        { provide: ActivityLogService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<ActivityLogController>(ActivityLogController);
    service = module.get(ActivityLogService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserSessions', () => {
    it('should return user sessions successfully', async () => {
      const expectedResponse = {
        sessions: [
          {
            id: 'session-123',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            deviceType: 'Desktop',
            browser: 'Chrome 120.0.0.0',
            operatingSystem: 'Windows 10',
            location: 'Lagos, Nigeria',
            loggedInAt: new Date(),
            loggedOutAt: null,
            isActive: true,
            activityType: 'LOGIN',
            isCurrentSession: true,
          },
        ],
        totalActiveSessions: 1,
        currentSessionId: 'session-123',
      };

      service.getUserSessions.mockResolvedValue(expectedResponse);

      const result = await controller.getUserSessions(mockRequest);

      expect(service.getUserSessions).toHaveBeenCalledWith('user-123', 'session-123');
      expect(result).toEqual(expectedResponse);
    });

    it('should handle service errors gracefully', async () => {
      service.getUserSessions.mockRejectedValue(new Error('Database error'));

      await expect(controller.getUserSessions(mockRequest)).rejects.toThrow('Database error');
    });
  });

  describe('getUserActivityHistory', () => {
    it('should return activity history with default pagination', async () => {
      const expectedResponse = {
        activities: [
          {
            id: 'activity-123',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            deviceType: 'Desktop',
            browser: 'Chrome 120.0.0.0',
            operatingSystem: 'Windows 10',
            location: 'Lagos, Nigeria',
            loggedInAt: new Date(),
            loggedOutAt: null,
            isActive: true,
            activityType: 'LOGIN',
            isCurrentSession: false,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      service.getUserActivityHistory.mockResolvedValue(expectedResponse);

      const result = await controller.getUserActivityHistory(mockRequest);

      expect(service.getUserActivityHistory).toHaveBeenCalledWith('user-123', 1, 20);
      expect(result).toEqual(expectedResponse);
    });

    it('should return activity history with custom pagination', async () => {
      const expectedResponse = {
        activities: [],
        total: 0,
        page: 2,
        limit: 10,
      };

      service.getUserActivityHistory.mockResolvedValue(expectedResponse);

      const result = await controller.getUserActivityHistory(mockRequest, 2, 10);

      expect(service.getUserActivityHistory).toHaveBeenCalledWith('user-123', 2, 10);
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('logoutOtherSessions', () => {
    it('should logout from other sessions successfully', async () => {
      const expectedResponse = {
        message: 'Successfully logged out from other devices',
        sessionsTerminated: 2,
      };

      service.logoutOtherSessions.mockResolvedValue(expectedResponse);

      const result = await controller.logoutOtherSessions(mockRequest);

      expect(service.logoutOtherSessions).toHaveBeenCalledWith('user-123', 'session-123');
      expect(result).toEqual(expectedResponse);
    });

    it('should handle service errors', async () => {
      service.logoutOtherSessions.mockRejectedValue(new Error('Logout failed'));

      await expect(controller.logoutOtherSessions(mockRequest)).rejects.toThrow('Logout failed');
    });
  });

  describe('logoutAllSessions', () => {
    it('should logout from all sessions successfully', async () => {
      const expectedResponse = {
        message: 'Successfully logged out from all devices',
        sessionsTerminated: 3,
      };

      service.logoutAllSessions.mockResolvedValue(expectedResponse);

      const result = await controller.logoutAllSessions(mockRequest);

      expect(service.logoutAllSessions).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(expectedResponse);
    });

    it('should handle service errors', async () => {
      service.logoutAllSessions.mockRejectedValue(new Error('Logout failed'));

      await expect(controller.logoutAllSessions(mockRequest)).rejects.toThrow('Logout failed');
    });
  });

  describe('terminateSession', () => {
    it('should terminate a specific session successfully', async () => {
      const sessionId = 'session-to-terminate';
      service.logLogoutActivity.mockResolvedValue(undefined);

      const result = await controller.terminateSession(mockRequest, sessionId);

      expect(service.logLogoutActivity).toHaveBeenCalledWith('user-123', sessionId);
      expect(result).toEqual({
        message: 'Session terminated successfully',
      });
    });

    it('should handle service errors', async () => {
      const sessionId = 'session-to-terminate';
      service.logLogoutActivity.mockRejectedValue(new Error('Termination failed'));

      await expect(controller.terminateSession(mockRequest, sessionId)).rejects.toThrow('Termination failed');
    });
  });

  describe('checkSuspiciousActivity', () => {
    it('should return suspicious activity check result', async () => {
      service.checkSuspiciousActivity.mockResolvedValue(false);

      const result = await controller.checkSuspiciousActivity(mockRequest);

      expect(service.checkSuspiciousActivity).toHaveBeenCalledWith('user-123', '192.168.1.1');
      expect(result).toEqual({
        isSuspicious: false,
        message: 'No suspicious activity detected',
      });
    });

    it('should return suspicious activity detected', async () => {
      service.checkSuspiciousActivity.mockResolvedValue(true);

      const result = await controller.checkSuspiciousActivity(mockRequest);

      expect(service.checkSuspiciousActivity).toHaveBeenCalledWith('user-123', '192.168.1.1');
      expect(result).toEqual({
        isSuspicious: true,
        message: 'Suspicious activity detected. Please verify your account.',
      });
    });

    it('should handle different IP address sources', async () => {
      const requestWithRealIp = {
        ...mockRequest,
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'x-real-ip': '10.0.0.1',
        },
      } as any;

      service.checkSuspiciousActivity.mockResolvedValue(false);

      await controller.checkSuspiciousActivity(requestWithRealIp);

      expect(service.checkSuspiciousActivity).toHaveBeenCalledWith('user-123', '10.0.0.1');
    });

    it('should handle missing IP headers', async () => {
      const requestWithoutIp = {
        ...mockRequest,
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        connection: { remoteAddress: '127.0.0.1' },
      } as any;

      service.checkSuspiciousActivity.mockResolvedValue(false);

      await controller.checkSuspiciousActivity(requestWithoutIp);

      expect(service.checkSuspiciousActivity).toHaveBeenCalledWith('user-123', '127.0.0.1');
    });
  });

  describe('extractIpAddress', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = {
        headers: {
          'x-forwarded-for': '203.0.113.1, 192.168.1.1',
        },
      } as any;

      const result = controller['extractIpAddress'](request);
      expect(result).toBe('203.0.113.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const request = {
        headers: {
          'x-real-ip': '10.0.0.1',
        },
      } as any;

      const result = controller['extractIpAddress'](request);
      expect(result).toBe('10.0.0.1');
    });

    it('should extract IP from connection remoteAddress', () => {
      const request = {
        headers: {},
        connection: { remoteAddress: '192.168.1.100' },
      } as any;

      const result = controller['extractIpAddress'](request);
      expect(result).toBe('192.168.1.100');
    });

    it('should extract IP from socket remoteAddress', () => {
      const request = {
        headers: {},
        socket: { remoteAddress: '172.16.0.1' },
      } as any;

      const result = controller['extractIpAddress'](request);
      expect(result).toBe('172.16.0.1');
    });

    it('should return Unknown when no IP is available', () => {
      const request = {
        headers: {},
      } as any;

      const result = controller['extractIpAddress'](request);
      expect(result).toBe('Unknown');
    });
  });
});
