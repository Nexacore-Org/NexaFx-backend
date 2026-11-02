const sendEachForMulticastMock = jest.fn();

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn(() => 'mock-cert'),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({
    sendEachForMulticast: sendEachForMulticastMock,
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FirebaseService } from './firebase.service';
import { User } from '../users/user.entity';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

describe('FirebaseService', () => {
  let service: FirebaseService;
  let configService: jest.Mocked<ConfigService>;
  let userRepo: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (getApps as jest.Mock).mockReturnValue([]);
    (cert as jest.Mock).mockReturnValue('mock-cert');
    sendEachForMulticastMock.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'FIREBASE_PROJECT_ID') return 'test-project';
        if (key === 'FIREBASE_CLIENT_EMAIL') return 'test@test.com';
        if (key === 'FIREBASE_PRIVATE_KEY') return 'test-private-key';
        return null;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    userRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockImplementation(async (u) => u),
    } as unknown as jest.Mocked<Repository<User>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirebaseService,
        { provide: ConfigService, useValue: configService },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get<FirebaseService>(FirebaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should format message correctly and call sendEachForMulticast', async () => {
    service.onModuleInit();

    expect(initializeApp).toHaveBeenCalledWith({
      credential: 'mock-cert',
    });

    const tokens = ['token-1234567890'];
    const title = 'Test Title';
    const body = 'Test Body';

    await service.sendToTokens(tokens, title, body);

    expect(getMessaging().sendEachForMulticast).toHaveBeenCalledWith({
      tokens,
      notification: {
        title,
        body,
      },
    });
  });

  it('should include data payload when provided and drop undefined entries', async () => {
    service.onModuleInit();

    const tokens = ['token-4567890123'];
    const title = 'Alert';
    const body = 'Something happened';
    const data = { txId: 'abc-123', ignored: undefined as unknown as string };

    await service.sendToTokens(tokens, title, body, data);

    expect(getMessaging().sendEachForMulticast).toHaveBeenCalledWith({
      tokens,
      notification: {
        title,
        body,
      },
      data: { txId: 'abc-123' },
    });
  });

  it('prunes unregistered tokens from users and masks tokens in logs', async () => {
    service.onModuleInit();

    const goodToken = 'good-device-token-abcdef123456';
    const deadToken = 'stale-device-token-unregistered-987654';
    const user: User = {
      id: 'user-1',
      fcmToken: deadToken,
      fcmTokens: [goodToken, deadToken],
    } as User;

    userRepo.find.mockResolvedValue([user]);

    sendEachForMulticastMock.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        {
          success: false,
          error: {
            code: 'messaging/registration-token-not-registered',
            message: 'NotRegistered',
          },
        },
      ],
    });

    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await service.sendToTokens([goodToken, deadToken], 'Hello', 'World');

    expect(userRepo.update).toHaveBeenCalledWith('user-1', {
      fcmTokens: [goodToken],
      fcmToken: goodToken,
    });

    const logged = warnSpy.mock.calls.map((c) => c.join(' '));
    for (const entry of logged) {
      expect(entry).not.toContain(deadToken);
      expect(entry).not.toContain(goodToken);
    }

    warnSpy.mockRestore();
  });
});
