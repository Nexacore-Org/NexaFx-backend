import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from './firebase.service';
import * as admin from 'firebase-admin';

jest.mock('firebase-admin', () => {
  const messagingMock = {
    sendEachForMulticast: jest.fn().mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    }),
  };

  return {
    credential: {
      cert: jest.fn().mockReturnValue('mock-cert'),
    },
    initializeApp: jest.fn(),
    messaging: jest.fn(() => messagingMock),
  };
});

describe('FirebaseService', () => {
  let service: FirebaseService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'FIREBASE_PROJECT_ID') return 'test-project';
        if (key === 'FIREBASE_CLIENT_EMAIL') return 'test@test.com';
        if (key === 'FIREBASE_PRIVATE_KEY') return 'test-private-key';
        return null;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirebaseService,
        { provide: ConfigService, useValue: configService },
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
    // Manually run onModuleInit since testing module doesn't do it automatically in simple compilation
    service.onModuleInit();

    expect(admin.initializeApp).toHaveBeenCalledWith({
      credential: 'mock-cert',
    });

    const tokens = ['token-123'];
    const title = 'Test Title';
    const body = 'Test Body';

    await service.sendToTokens(tokens, title, body);

    expect(admin.messaging().sendEachForMulticast).toHaveBeenCalledWith({
      tokens,
      notification: {
        title,
        body,
      },
    });
  });

  it('should include data payload when provided', async () => {
    service.onModuleInit();

    const tokens = ['token-456'];
    const title = 'Alert';
    const body = 'Something happened';
    const data = { txId: 'abc-123' };

    await service.sendToTokens(tokens, title, body, data);

    expect(admin.messaging().sendEachForMulticast).toHaveBeenCalledWith({
      tokens,
      notification: {
        title,
        body,
      },
      data,
    });
  });
});
