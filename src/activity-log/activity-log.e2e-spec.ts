import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ActivityLogModule } from './activity-log.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityLog } from './entities/activity-log.entity';

describe('ActivityLogController (e2e)', () => {
  let app: INestApplication;
  let activityLogRepository: Repository<ActivityLog>;

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
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ActivityLogModule],
    })
      .overrideProvider(getRepositoryToken(ActivityLog))
      .useValue({
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        findAndCount: jest.fn(),
        count: jest.fn(),
        createQueryBuilder: jest.fn(() => ({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        })),
        delete: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    activityLogRepository = moduleFixture.get<Repository<ActivityLog>>(
      getRepositoryToken(ActivityLog),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/activity-logs/sessions (GET)', () => {
    it('should return user sessions', () => {
      jest
        .spyOn(activityLogRepository, 'find')
        .mockResolvedValue([mockActivityLog] as any);

      return request(app.getHttpServer())
        .get('/activity-logs/sessions')
        .set('Authorization', 'Bearer mock-token')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('sessions');
          expect(res.body).toHaveProperty('totalActiveSessions');
          expect(res.body).toHaveProperty('currentSessionId');
          expect(Array.isArray(res.body.sessions)).toBe(true);
        });
    });

    it('should return empty sessions when no active sessions', () => {
      jest.spyOn(activityLogRepository, 'find').mockResolvedValue([]);

      return request(app.getHttpServer())
        .get('/activity-logs/sessions')
        .set('Authorization', 'Bearer mock-token')
        .expect(200)
        .expect((res) => {
          expect(res.body.sessions).toHaveLength(0);
          expect(res.body.totalActiveSessions).toBe(0);
        });
    });
  });

  describe('/activity-logs/history (GET)', () => {
    it('should return activity history with default pagination', () => {
      jest
        .spyOn(activityLogRepository, 'findAndCount')
        .mockResolvedValue([[mockActivityLog], 1] as any);

      return request(app.getHttpServer())
        .get('/activity-logs/history')
        .set('Authorization', 'Bearer mock-token')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('activities');
          expect(res.body).toHaveProperty('total');
          expect(res.body).toHaveProperty('page');
          expect(res.body).toHaveProperty('limit');
          expect(Array.isArray(res.body.activities)).toBe(true);
        });
    });

    it('should return activity history with custom pagination', () => {
      jest
        .spyOn(activityLogRepository, 'findAndCount')
        .mockResolvedValue([[], 0] as any);

      return request(app.getHttpServer())
        .get('/activity-logs/history?page=2&limit=10')
        .set('Authorization', 'Bearer mock-token')
        .expect(200)
        .expect((res) => {
          expect(res.body.page).toBe(2);
          expect(res.body.limit).toBe(10);
        });
    });
  });

  describe('/activity-logs/logout-other-sessions (POST)', () => {
    it('should logout from other sessions', () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      };

      jest
        .spyOn(activityLogRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      return request(app.getHttpServer())
        .post('/activity-logs/logout-other-sessions')
        .set('Authorization', 'Bearer mock-token')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body).toHaveProperty('sessionsTerminated');
          expect(res.body.message).toBe(
            'Successfully logged out from other devices',
          );
        });
    });
  });

  describe('/activity-logs/logout-all-sessions (POST)', () => {
    it('should logout from all sessions', () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 3 }),
      };

      jest
        .spyOn(activityLogRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      return request(app.getHttpServer())
        .post('/activity-logs/logout-all-sessions')
        .set('Authorization', 'Bearer mock-token')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body).toHaveProperty('sessionsTerminated');
          expect(res.body.message).toBe(
            'Successfully logged out from all devices',
          );
        });
    });
  });

  describe('/activity-logs/session/:sessionId (DELETE)', () => {
    it('should terminate a specific session', () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      jest
        .spyOn(activityLogRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      return request(app.getHttpServer())
        .delete('/activity-logs/session/session-123')
        .set('Authorization', 'Bearer mock-token')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body.message).toBe('Session terminated successfully');
        });
    });
  });

  describe('/activity-logs/suspicious-check (GET)', () => {
    it('should return no suspicious activity', () => {
      jest
        .spyOn(activityLogRepository, 'findOne')
        .mockResolvedValue(mockActivityLog as any);
      jest.spyOn(activityLogRepository, 'count').mockResolvedValue(5);

      return request(app.getHttpServer())
        .get('/activity-logs/suspicious-check')
        .set('Authorization', 'Bearer mock-token')
        .set('X-Forwarded-For', '192.168.1.1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('isSuspicious');
          expect(res.body).toHaveProperty('message');
          expect(res.body.isSuspicious).toBe(false);
          expect(res.body.message).toBe('No suspicious activity detected');
        });
    });

    it('should return suspicious activity detected', () => {
      jest.spyOn(activityLogRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(activityLogRepository, 'count').mockResolvedValue(5);

      return request(app.getHttpServer())
        .get('/activity-logs/suspicious-check')
        .set('Authorization', 'Bearer mock-token')
        .set('X-Real-IP', '10.0.0.1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('isSuspicious');
          expect(res.body).toHaveProperty('message');
          expect(res.body.isSuspicious).toBe(true);
          expect(res.body.message).toBe(
            'Suspicious activity detected. Please verify your account.',
          );
        });
    });

    it('should handle different IP address sources', () => {
      jest
        .spyOn(activityLogRepository, 'findOne')
        .mockResolvedValue(mockActivityLog as any);
      jest.spyOn(activityLogRepository, 'count').mockResolvedValue(5);

      return request(app.getHttpServer())
        .get('/activity-logs/suspicious-check')
        .set('Authorization', 'Bearer mock-token')
        .set('X-Real-IP', '203.0.113.1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('isSuspicious');
        });
    });
  });

  describe('IP address extraction', () => {
    it('should extract IP from x-forwarded-for header', () => {
      jest
        .spyOn(activityLogRepository, 'findOne')
        .mockResolvedValue(mockActivityLog as any);
      jest.spyOn(activityLogRepository, 'count').mockResolvedValue(5);

      return request(app.getHttpServer())
        .get('/activity-logs/suspicious-check')
        .set('Authorization', 'Bearer mock-token')
        .set('X-Forwarded-For', '203.0.113.1, 192.168.1.1')
        .expect(200);
    });

    it('should extract IP from x-real-ip header', () => {
      jest
        .spyOn(activityLogRepository, 'findOne')
        .mockResolvedValue(mockActivityLog as any);
      jest.spyOn(activityLogRepository, 'count').mockResolvedValue(5);

      return request(app.getHttpServer())
        .get('/activity-logs/suspicious-check')
        .set('Authorization', 'Bearer mock-token')
        .set('X-Real-IP', '10.0.0.1')
        .expect(200);
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all endpoints', () => {
      return request(app.getHttpServer())
        .get('/activity-logs/sessions')
        .expect(401);
    });

    it('should require authentication for history endpoint', () => {
      return request(app.getHttpServer())
        .get('/activity-logs/history')
        .expect(401);
    });

    it('should require authentication for logout endpoints', () => {
      return request(app.getHttpServer())
        .post('/activity-logs/logout-other-sessions')
        .expect(401);
    });

    it('should require authentication for session termination', () => {
      return request(app.getHttpServer())
        .delete('/activity-logs/session/session-123')
        .expect(401);
    });

    it('should require authentication for suspicious activity check', () => {
      return request(app.getHttpServer())
        .get('/activity-logs/suspicious-check')
        .expect(401);
    });
  });
});
