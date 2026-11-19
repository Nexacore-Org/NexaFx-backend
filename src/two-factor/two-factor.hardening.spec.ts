import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { IsNull } from 'typeorm';
import * as speakeasy from 'speakeasy';
import * as bcrypt from 'bcrypt';

import { TwoFactorService } from './two-factor.service';
import { BackupCode } from './entities/backup-code.entity';
import { UsersService } from '../users/users.service';
import { EncryptionService } from '../common/services/encryption.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { User } from '../users/user.entity';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,x'),
}));

const SECRET = 'JBSWY3DPEHPK3PXP';
const ENCRYPTED = `encrypted:${SECRET}`;

const enabledUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: 'alice@example.com',
    isTwoFactorEnabled: true,
    twoFactorSecret: ENCRYPTED,
    pendingTwoFactorSecret: null,
    lastTotpStep: null,
    twoFactorFailedAttempts: 0,
    twoFactorLockedUntil: null,
    ...overrides,
  }) as User;

describe('TwoFactorService hardening', () => {
  let service: TwoFactorService;

  const usersService = {
    findById: jest.fn(),
    updateByUserId: jest.fn().mockResolvedValue(undefined),
    incrementTwoFactorFailedAttempts: jest.fn().mockResolvedValue(1),
    acceptTotpStep: jest.fn().mockResolvedValue(true),
  };
  const encryptionService = {
    encrypt: jest.fn(() => ENCRYPTED),
    decrypt: jest.fn((value: string) => value.replace('encrypted:', '')),
  };
  const backupCodeRepository = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((input: Partial<BackupCode>) => input),
    save: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const auditLogsService = { logAuthEvent: jest.fn().mockResolvedValue(undefined) };
  const refreshTokensService = {
    revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
  };
  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  const configService = { get: jest.fn().mockReturnValue(undefined) };

  const currentTotp = (): string =>
    speakeasy.totp({ secret: SECRET, encoding: 'base32' });

  beforeEach(async () => {
    jest.clearAllMocks();
    configService.get.mockReturnValue(undefined);
    usersService.updateByUserId.mockResolvedValue(undefined);
    usersService.incrementTwoFactorFailedAttempts.mockReset().mockResolvedValue(1);
    usersService.acceptTotpStep.mockReset().mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        {
          provide: getRepositoryToken(BackupCode),
          useValue: backupCodeRepository,
        },
        { provide: UsersService, useValue: usersService },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ConfigService, useValue: configService },
        { provide: RefreshTokensService, useValue: refreshTokensService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(TwoFactorService);
  });

  describe('setup cannot disable an active second factor', () => {
    it('rejects with 409 when 2FA is already enabled', async () => {
      usersService.findById.mockResolvedValue(enabledUser());

      await expect(service.generateSecret('user-1')).rejects.toThrow(
        ConflictException,
      );
      expect(usersService.updateByUserId).not.toHaveBeenCalled();
    });

    it('leaves the active secret untouched on a rejected setup', async () => {
      const user = enabledUser();
      usersService.findById.mockResolvedValue(user);

      await expect(service.generateSecret(user.id)).rejects.toThrow();

      const patch = usersService.updateByUserId.mock.calls[0]?.[1];
      expect(patch).toBeUndefined();
    });

    it('keeps the active secret when a setup is pending', async () => {
      usersService.findById.mockResolvedValue(
        enabledUser({
          isTwoFactorEnabled: false,
          twoFactorSecret: ENCRYPTED,
        }),
      );

      await service.generateSecret('user-1');

      const patch = usersService.updateByUserId.mock.calls[0][1];
      expect(patch).toEqual({ pendingTwoFactorSecret: expect.any(String) });
      expect(patch).not.toHaveProperty('twoFactorSecret');
      expect(patch).not.toHaveProperty('isTwoFactorEnabled');
    });
  });

  describe('TOTP replay protection', () => {
    it('records the step of an accepted code', async () => {
      usersService.findById.mockResolvedValue(enabledUser());

      await expect(service.verifyTotpCode('user-1', currentTotp())).resolves.toBe(
        true,
      );

      const nowStep = Math.floor(Date.now() / 1000 / 30);
      expect(usersService.acceptTotpStep).toHaveBeenCalledWith(
        'user-1',
        expect.any(Number),
      );
      expect(usersService.updateByUserId).toHaveBeenCalledWith('user-1', {
        twoFactorFailedAttempts: 0,
        twoFactorLockedUntil: null,
      });
      expect(nowStep).toBeGreaterThan(0);
    });

    it('refuses the same code twice', async () => {
      const nowStep = Math.floor(Date.now() / 1000 / 30);
      const code = currentTotp();

      usersService.findById.mockResolvedValue(enabledUser());
      await expect(service.verifyTotpCode('user-1', code)).resolves.toBe(true);

      usersService.updateByUserId.mockClear();
      usersService.findById.mockResolvedValue(
        enabledUser({ lastTotpStep: nowStep }),
      );
      await expect(service.verifyTotpCode('user-1', code)).resolves.toBe(false);
    });

    it('counts a replay as a failed attempt', async () => {
      const nowStep = Math.floor(Date.now() / 1000 / 30);
      usersService.findById.mockResolvedValue(
        enabledUser({ lastTotpStep: nowStep }),
      );

      await expect(
        service.verifyTotpCode('user-1', currentTotp()),
      ).resolves.toBe(false);

      expect(usersService.incrementTwoFactorFailedAttempts).toHaveBeenCalledWith(
        'user-1',
        5,
        15,
      );
    });
  });

  describe('per-user lockout', () => {
    it('locks after the configured number of failures', async () => {
      usersService.findById.mockResolvedValue(
        enabledUser({ twoFactorFailedAttempts: 4 }),
      );

      await expect(service.verifyTotpCode('user-1', '000000')).resolves.toBe(
        false,
      );

      expect(
        usersService.incrementTwoFactorFailedAttempts,
      ).toHaveBeenCalledWith('user-1', 5, 15);
    });

    it('honours TWO_FACTOR_MAX_FAILED_ATTEMPTS', async () => {
      configService.get.mockImplementation(
        (key: string) =>
          key === 'TWO_FACTOR_MAX_FAILED_ATTEMPTS' ? '2' : undefined,
      );
      usersService.findById.mockResolvedValue(
        enabledUser({ twoFactorFailedAttempts: 1 }),
      );

      await service.verifyTotpCode('user-1', '000000');

      expect(
        usersService.incrementTwoFactorFailedAttempts,
      ).toHaveBeenCalledWith('user-1', 2, 15);
    });

    it('honours TWO_FACTOR_LOCKOUT_MINUTES', async () => {
      configService.get.mockImplementation(
        (key: string) =>
          key === 'TWO_FACTOR_LOCKOUT_MINUTES' ? '30' : undefined,
      );
      usersService.findById.mockResolvedValue(
        enabledUser({ twoFactorFailedAttempts: 4 }),
      );

      await service.verifyTotpCode('user-1', '000000');

      expect(
        usersService.incrementTwoFactorFailedAttempts,
      ).toHaveBeenCalledWith('user-1', 5, 30);
    });

    it('returns 429 with retry guidance while locked', async () => {
      usersService.findById.mockResolvedValue(
        enabledUser({
          twoFactorLockedUntil: new Date(Date.now() + 5 * 60 * 1000),
        }),
      );

      expect.assertions(3);
      try {
        await service.verifyTotpCode('user-1', currentTotp());
      } catch (error) {
        expect(error).toBeInstanceOf(ThrottlerException);
        expect((error as ThrottlerException).getStatus()).toBe(429);
        expect((error as Error).message).toContain('Try again in 5 minute(s)');
      }
    });

    it('refuses to verify once the lock has expired', async () => {
      usersService.findById.mockResolvedValue(
        enabledUser({
          twoFactorLockedUntil: new Date(Date.now() - 1000),
        }),
      );

      await expect(
        service.verifyTotpCode('user-1', currentTotp()),
      ).resolves.toBe(true);
    });

    it('clears the counters after a successful verification', async () => {
      usersService.findById.mockResolvedValue(
        enabledUser({ twoFactorFailedAttempts: 3 }),
      );

      await service.verifyTotpCode('user-1', currentTotp());

      expect(usersService.updateByUserId).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          twoFactorFailedAttempts: 0,
          twoFactorLockedUntil: null,
        }),
      );
    });
  });

  describe('backup code consumption', () => {
    it('marks a code consumed only while it is still unconsumed', async () => {
      usersService.findById.mockResolvedValue(enabledUser());
      backupCodeRepository.find.mockResolvedValue([
        { id: 'bc-1', codeHash: await bcrypt.hash('BACKUPCODE1', 4) },
      ]);

      await service.consumeBackupCode('user-1', 'BACKUPCODE1');

      expect(backupCodeRepository.update).toHaveBeenCalledWith(
        { id: 'bc-1', consumedAt: IsNull() },
        { consumedAt: expect.any(Date) },
      );
    });

    it('rejects when a concurrent request consumed the code first', async () => {
      usersService.findById.mockResolvedValue(enabledUser());
      backupCodeRepository.find.mockResolvedValue([
        { id: 'bc-1', codeHash: await bcrypt.hash('BACKUPCODE1', 4) },
      ]);
      backupCodeRepository.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.consumeBackupCode('user-1', 'BACKUPCODE1'),
      ).rejects.toThrow('Invalid backup code');
    });

    it('counts an invalid backup code as a failed attempt', async () => {
      usersService.findById.mockResolvedValue(enabledUser());
      backupCodeRepository.find.mockResolvedValue([]);

      await expect(
        service.consumeBackupCode('user-1', 'WRONGCODE12'),
      ).rejects.toThrow('Invalid backup code');

      expect(
        usersService.incrementTwoFactorFailedAttempts,
      ).toHaveBeenCalledWith('user-1', 5, 15);
    });
  });

  describe('concurrent verification', () => {
    it('accepts only one of two parallel submissions of the same code', async () => {
      usersService.findById.mockResolvedValue(enabledUser());
      usersService.acceptTotpStep
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const code = currentTotp();

      const results = await Promise.all([
        service.verifyTotpCode('user-1', code),
        service.verifyTotpCode('user-1', code),
      ]);

      expect(results).toEqual([true, false]);
      expect(usersService.acceptTotpStep).toHaveBeenCalledTimes(2);
      expect(
        usersService.incrementTwoFactorFailedAttempts,
      ).toHaveBeenCalledTimes(1);
    });

    it('counts parallel invalid guesses independently', async () => {
      usersService.findById.mockResolvedValue(enabledUser());
      usersService.incrementTwoFactorFailedAttempts
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);

      const results = await Promise.all([
        service.verifyTotpCode('user-1', '000000'),
        service.verifyTotpCode('user-1', '111111'),
      ]);

      expect(results).toEqual([false, false]);
      expect(
        usersService.incrementTwoFactorFailedAttempts,
      ).toHaveBeenCalledTimes(2);
      expect(usersService.acceptTotpStep).not.toHaveBeenCalled();
    });
  });

  describe('audit trail', () => {
    it('records setup, enable and disable', async () => {
      usersService.findById.mockResolvedValue(
        enabledUser({ isTwoFactorEnabled: false, twoFactorSecret: null }),
      );
      await service.generateSecret('user-1');

      usersService.findById.mockResolvedValue(
        enabledUser({ isTwoFactorEnabled: false, pendingTwoFactorSecret: ENCRYPTED }),
      );
      await service.confirmTwoFactor('user-1', currentTotp());

      usersService.findById.mockResolvedValue(enabledUser());
      await service.disableTwoFactor('user-1', currentTotp());

      const actions = auditLogsService.logAuthEvent.mock.calls.map(
        (call) => call[1],
      );
      expect(actions).toEqual(['TWO_FACTOR_SETUP', 'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED']);
    });
  });
});