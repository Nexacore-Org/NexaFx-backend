const sendEachForMulticastMock = jest.fn();

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => [{ name: '[DEFAULT]' }]),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({
    sendEachForMulticast: sendEachForMulticastMock,
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FCMService, stringifyFcmData } from './fcm.service';
import { User } from '../users/user.entity';
import { getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

describe('FCMService', () => {
  let service: FCMService;
  let userRepo: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (getApps as jest.Mock).mockReturnValue([{ name: '[DEFAULT]' }]);

    const mockUserRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockImplementation(async (u) => u),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FCMService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
      ],
    }).compile();

    service = module.get<FCMService>(FCMService);
    userRepo = module.get(getRepositoryToken(User));
  });

  it('stringifyFcmData drops undefined values and stringifies non-strings', () => {
    const result = stringifyFcmData({
      notificationId: 'notif-1',
      missingField: undefined,
      count: 42,
      nested: { a: 1 },
      unserializable: () => {},
    });

    expect(result).toEqual({
      notificationId: 'notif-1',
      count: '42',
      nested: '{"a":1}',
    });
    expect('missingField' in result).toBe(false);
    expect('unserializable' in result).toBe(false);
  });

  it('sends to all 3 registered device tokens via sendEachForMulticast with string-only data', async () => {
    const tokens = [
      'device-token-alpha-111111',
      'device-token-bravo-222222',
      'device-token-charlie-333333',
    ];
    userRepo.findOne.mockResolvedValue({
      id: 'user-3-devices',
      fcmToken: tokens[0],
      fcmTokens: [...tokens],
    } as User);

    sendEachForMulticastMock.mockResolvedValue({
      successCount: 3,
      failureCount: 0,
      responses: [{ success: true }, { success: true }, { success: true }],
    });

    await service.sendPush('user-3-devices', 'Title', 'Body', {
      notificationId: 'notif-100',
      dropped: undefined,
      amount: 100,
    });

    expect(getMessaging().sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(sendEachForMulticastMock).toHaveBeenCalledWith({
      tokens,
      notification: { title: 'Title', body: 'Body' },
      data: {
        notificationId: 'notif-100',
        amount: '100',
      },
    });
  });

  it('prunes unregistered and invalid-argument tokens from user.fcmTokens and masks tokens in logs', async () => {
    const validToken = 'valid-fcm-token-99999999';
    const deadToken1 = 'dead-fcm-token-unregistered-111111';
    const deadToken2 = 'dead-fcm-token-invalid-arg-222222';
    const transientToken = 'transient-error-fcm-token-333333';

    const user: User = {
      id: 'user-prune',
      fcmToken: deadToken1,
      fcmTokens: [deadToken1, validToken, deadToken2, transientToken],
    } as User;
    userRepo.findOne.mockResolvedValue(user);

    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    sendEachForMulticastMock.mockResolvedValue({
      successCount: 1,
      failureCount: 3,
      responses: [
        {
          success: false,
          error: {
            code: 'messaging/registration-token-not-registered',
            message: 'Requested entity was not found.',
          },
        },
        { success: true },
        {
          success: false,
          error: {
            code: 'invalid-argument',
            message: 'The registration token is not a valid FCM registration token',
          },
        },
        {
          success: false,
          error: {
            code: 'messaging/internal-error',
            message: 'Internal server error',
          },
        },
      ],
    });

    await service.sendPush('user-prune', 'Alert', 'Body', {
      notificationId: 'notif-200',
    });

    expect(userRepo.update).toHaveBeenCalledWith('user-prune', {
      fcmTokens: [validToken, transientToken],
      fcmToken: validToken,
    });
    expect(user.fcmTokens).toEqual([validToken, transientToken]);

    const loggedMessages = warnSpy.mock.calls.map((args) => args.join(' '));
    for (const msg of loggedMessages) {
      expect(msg).not.toContain(deadToken1);
      expect(msg).not.toContain(deadToken2);
      expect(msg).not.toContain(transientToken);
    }

    warnSpy.mockRestore();
  });
});
