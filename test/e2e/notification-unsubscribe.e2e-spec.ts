import {
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { IS_PUBLIC_KEY } from '../../src/auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { NotificationPreferenceController } from '../../src/notifications/controllers/notification-preference.controller';
import {
  NotificationDigestMode,
  NotificationPreference,
} from '../../src/notifications/entities/notification-preference.entity';
import { NotificationType } from '../../src/notifications/enum/notificationType.enum';
import { NotificationPreferenceService } from '../../src/notifications/services/notification-preference.service';

@Injectable()
class TestGlobalJwtGuard {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    throw new UnauthorizedException('Missing or invalid JWT');
  }
}

describe('Email Unsubscribe without JWT (e2e) — #1514', () => {
  let app: INestApplication;
  let preferenceService: NotificationPreferenceService;
  const preferencesStore = new Map<string, NotificationPreference>();

  const mockPreferenceRepository = {
    create: jest.fn((dto: Partial<NotificationPreference>) => ({
      ...dto,
    })),
    createQueryBuilder: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn((rows: NotificationPreference[]) => {
        for (const row of rows) {
          const key = `${row.userId}:${row.notificationType}`;
          if (!preferencesStore.has(key)) {
            preferencesStore.set(key, { ...row } as NotificationPreference);
          }
        }
        return {
          orIgnore: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue(undefined),
        };
      }),
    })),
    update: jest.fn(
      async (
        criteria: { userId: string; notificationType: NotificationType },
        partial: Partial<NotificationPreference>,
      ) => {
        const key = `${criteria.userId}:${criteria.notificationType}`;
        const existing = preferencesStore.get(key);
        if (existing) {
          preferencesStore.set(key, { ...existing, ...partial });
        }
        return { affected: existing ? 1 : 0 };
      },
    ),
    find: jest.fn(async () => Array.from(preferencesStore.values())),
    findOne: jest.fn(
      async ({
        where,
      }: {
        where: { userId: string; notificationType: NotificationType };
      }) => {
        return (
          preferencesStore.get(`${where.userId}:${where.notificationType}`) ??
          null
        );
      },
    ),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [NotificationPreferenceController],
      providers: [
        NotificationPreferenceService,
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: mockPreferenceRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'JWT_SECRET') return 'test-jwt-secret-1514';
              return undefined;
            },
          },
        },
        {
          provide: APP_GUARD,
          useClass: TestGlobalJwtGuard,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestGlobalJwtGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    preferenceService = moduleFixture.get(NotificationPreferenceService);
  });

  beforeEach(() => {
    preferencesStore.clear();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /notifications/unsubscribe?token=<valid> returns 200 without JWT and sets emailEnabled=false', async () => {
    const token = preferenceService.generateUnsubscribeToken(
      'user-42',
      NotificationType.RATE_ALERT_TRIGGERED,
    );

    const res = await request(app.getHttpServer())
      .post('/notifications/unsubscribe')
      .query({ token })
      .expect(200);

    expect(res.body).toEqual({
      message: 'You have been unsubscribed from these emails',
    });

    const updated = preferencesStore.get(
      `user-42:${NotificationType.RATE_ALERT_TRIGGERED}`,
    );
    expect(updated).toMatchObject({
      userId: 'user-42',
      notificationType: NotificationType.RATE_ALERT_TRIGGERED,
      emailEnabled: false,
      digestMode: NotificationDigestMode.IMMEDIATE,
    });
  });

  it('GET /notifications/unsubscribe?token=<valid> returns 200 without JWT and sets emailEnabled=false', async () => {
    const token = preferenceService.generateUnsubscribeToken(
      'user-42',
      NotificationType.KYC_APPROVED,
    );

    const res = await request(app.getHttpServer())
      .get('/notifications/unsubscribe')
      .query({ token })
      .expect(200);

    expect(res.body).toEqual({
      message: 'You have been unsubscribed from these emails',
    });

    const updated = preferencesStore.get(
      `user-42:${NotificationType.KYC_APPROVED}`,
    );
    expect(updated?.emailEnabled).toBe(false);
  });

  it('returns 403 for a forged unsubscribe token', async () => {
    const forged = Buffer.from(
      `user-42:${NotificationType.KYC_APPROVED}:${Date.now()}:deadbeef`,
    ).toString('base64url');

    await request(app.getHttpServer())
      .post('/notifications/unsubscribe')
      .query({ token: forged })
      .expect(403);
  });

  it('returns 403 for an expired unsubscribe token', async () => {
    const realNow = Date.now;
    const hundredDaysAgo = realNow() - 100 * 24 * 60 * 60 * 1000;
    Date.now = () => hundredDaysAgo;
    const expiredToken = preferenceService.generateUnsubscribeToken(
      'user-42',
      NotificationType.KYC_APPROVED,
    );
    Date.now = realNow;

    await request(app.getHttpServer())
      .post('/notifications/unsubscribe')
      .query({ token: expiredToken })
      .expect(403);
  });
});
