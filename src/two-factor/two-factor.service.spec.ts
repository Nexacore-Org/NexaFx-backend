import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { TwoFactorService } from './two-factor.service';
import { BackupCode } from './entities/backup-code.entity';
import { UsersService } from '../users/users.service';
import { EncryptionService } from '../common/services/encryption.service';

jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(),
  totp: { verify: jest.fn() },
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));
jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let usersService: { findById: jest.Mock; updateByUserId: jest.Mock };
  let encryptionService: { encrypt: jest.Mock; decrypt: jest.Mock };
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
  };

  const mockedSpeakeasy = speakeasy as jest.Mocked<typeof speakeasy>;
  const totpVerify = mockedSpeakeasy.totp.verify as jest.Mock;
  const bcryptHash = bcrypt.hash as jest.Mock;
  const bcryptCompare = bcrypt.compare as jest.Mock;

  const enabledUser = {
    id: 'user-1',
    email: 'alice@example.com',
    isTwoFactorEnabled: true,
    twoFactorSecret: 'enc-secret',
  };
  const setupUser = { ...enabledUser, isTwoFactorEnabled: false };
  const bareUser = {
    ...enabledUser,
    isTwoFactorEnabled: false,
    twoFactorSecret: null,
  };

  beforeEach(async () => {
    usersService = {
      findById: jest.fn(),
      updateByUserId: jest.fn().mockResolvedValue(undefined),
    };
    encryptionService = {
      encrypt: jest.fn().mockReturnValue('enc-secret'),
      decrypt: jest.fn().mockReturnValue('PLAINSECRET'),
    };
    repo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn(async (e) => e),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    bcryptHash.mockImplementation(async (code: string) => `hash:${code}`);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: getRepositoryToken(BackupCode), useValue: repo },
        { provide: UsersService, useValue: usersService },
        { provide: EncryptionService, useValue: encryptionService },
      ],
    }).compile();

    service = module.get(TwoFactorService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateSecret', () => {
    beforeEach(() => {
      (mockedSpeakeasy.generateSecret as jest.Mock).mockReturnValue({
        base32: 'PLAINSECRET',
        otpauth_url: 'otpauth://totp/NexaFX:alice',
      });
      (qrcode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,xx');
    });

    it('generates, encrypts and stores a secret without enabling 2FA', async () => {
      usersService.findById.mockResolvedValue(bareUser);

      const result = await service.generateSecret('user-1');

      expect(mockedSpeakeasy.generateSecret).toHaveBeenCalledWith({
        name: 'alice@example.com',
        issuer: 'NexaFX',
        length: 20,
      });
      expect(encryptionService.encrypt).toHaveBeenCalledWith('PLAINSECRET');
      expect(usersService.updateByUserId).toHaveBeenCalledWith('user-1', {
        twoFactorSecret: 'enc-secret',
        isTwoFactorEnabled: false,
      });
      expect(qrcode.toDataURL).toHaveBeenCalledWith('otpauth://totp/NexaFX:alice');
      expect(result).toEqual({
        otpauthUrl: 'otpauth://totp/NexaFX:alice',
        qrCodeDataUrl: 'data:image/png;base64,xx',
        manualEntryKey: 'PLAINSECRET',
      });
    });

    it('throws NotFoundException for an unknown user', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.generateSecret('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(usersService.updateByUserId).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when speakeasy returns an incomplete secret', async () => {
      usersService.findById.mockResolvedValue(bareUser);
      (mockedSpeakeasy.generateSecret as jest.Mock).mockReturnValue({
        base32: 'PLAINSECRET',
        otpauth_url: undefined,
      });

      await expect(service.generateSecret('user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(usersService.updateByUserId).not.toHaveBeenCalled();
    });
  });

  describe('confirmTwoFactor', () => {
    it('enables 2FA and issues 8 unique hashed backup codes', async () => {
      usersService.findById.mockResolvedValue(setupUser);
      totpVerify.mockReturnValue(true);

      const { backupCodes } = await service.confirmTwoFactor('user-1', '123456');

      expect(encryptionService.decrypt).toHaveBeenCalledWith('enc-secret');
      expect(totpVerify).toHaveBeenCalledWith({
        secret: 'PLAINSECRET',
        encoding: 'base32',
        token: '123456',
        window: 1,
      });
      expect(usersService.updateByUserId).toHaveBeenCalledWith('user-1', {
        isTwoFactorEnabled: true,
      });
      expect(repo.delete).toHaveBeenCalledWith({ userId: 'user-1' });

      expect(backupCodes).toHaveLength(8);
      expect(new Set(backupCodes).size).toBe(8);
      backupCodes.forEach((c) =>
        expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/),
      );

      backupCodes.forEach((c) => expect(bcryptHash).toHaveBeenCalledWith(c, 12));
      const saved = repo.save.mock.calls[0][0];
      expect(saved).toHaveLength(8);
      saved.forEach((e: any, i: number) =>
        expect(e).toEqual({
          userId: 'user-1',
          codeHash: `hash:${backupCodes[i]}`,
          consumedAt: null,
        }),
      );
    });

    it('never persists plaintext backup codes', async () => {
      usersService.findById.mockResolvedValue(setupUser);
      totpVerify.mockReturnValue(true);

      const { backupCodes } = await service.confirmTwoFactor('user-1', '123456');

      const saved = JSON.stringify(repo.save.mock.calls[0][0]);
      backupCodes.forEach((c) =>
        expect(saved).not.toContain(`"codeHash":"${c}"`),
      );
    });

    it('throws NotFoundException for an unknown user', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.confirmTwoFactor('nope', '123456'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when setup has not been run', async () => {
      usersService.findById.mockResolvedValue(bareUser);

      await expect(
        service.confirmTwoFactor('user-1', '123456'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(totpVerify).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException for an invalid code and changes nothing', async () => {
      usersService.findById.mockResolvedValue(setupUser);
      totpVerify.mockReturnValue(false);

      await expect(
        service.confirmTwoFactor('user-1', '000000'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.updateByUserId).not.toHaveBeenCalled();
      expect(repo.delete).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('disableTwoFactor', () => {
    it('clears the secret, disables 2FA and deletes backup codes', async () => {
      usersService.findById.mockResolvedValue(enabledUser);
      totpVerify.mockReturnValue(true);

      await service.disableTwoFactor('user-1', '123456');

      expect(usersService.updateByUserId).toHaveBeenCalledWith('user-1', {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
      });
      expect(repo.delete).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    it('throws NotFoundException for an unknown user', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.disableTwoFactor('nope', '123456'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when 2FA is not enabled', async () => {
      usersService.findById.mockResolvedValue(setupUser);

      await expect(
        service.disableTwoFactor('user-1', '123456'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws UnauthorizedException for an invalid code and keeps 2FA on', async () => {
      usersService.findById.mockResolvedValue(enabledUser);
      totpVerify.mockReturnValue(false);

      await expect(
        service.disableTwoFactor('user-1', '000000'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.updateByUserId).not.toHaveBeenCalled();
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('verifyTotpCode', () => {
    it('returns true for a valid code', async () => {
      usersService.findById.mockResolvedValue(enabledUser);
      totpVerify.mockReturnValue(true);

      await expect(service.verifyTotpCode('user-1', '123456')).resolves.toBe(true);
    });

    it('returns false for an invalid code', async () => {
      usersService.findById.mockResolvedValue(enabledUser);
      totpVerify.mockReturnValue(false);

      await expect(service.verifyTotpCode('user-1', '000000')).resolves.toBe(false);
    });

    it('tolerates exactly one step of clock drift (window: 1)', async () => {
      usersService.findById.mockResolvedValue(enabledUser);
      totpVerify.mockReturnValue(true);

      await service.verifyTotpCode('user-1', '123456');

      expect(totpVerify).toHaveBeenCalledWith(
        expect.objectContaining({ window: 1 }),
      );
    });

    it('throws NotFoundException for an unknown user', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.verifyTotpCode('nope', '123456'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when 2FA was set up but never confirmed', async () => {
      usersService.findById.mockResolvedValue(setupUser);

      await expect(
        service.verifyTotpCode('user-1', '123456'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(totpVerify).not.toHaveBeenCalled();
    });
  });

  describe('consumeBackupCode', () => {
    const stored = [
      { id: 'bc-1', userId: 'user-1', codeHash: 'h1', consumedAt: null },
      { id: 'bc-2', userId: 'user-1', codeHash: 'h2', consumedAt: null },
    ];

    it('only considers unconsumed codes for the user and marks the match consumed', async () => {
      usersService.findById.mockResolvedValue(enabledUser);
      repo.find.mockResolvedValue(stored);
      bcryptCompare.mockImplementation(async (_c, hash) => hash === 'h2');

      await service.consumeBackupCode('user-1', 'ABCDEFGHJK');

      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1', consumedAt: IsNull() },
      });
      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledWith('bc-2', {
        consumedAt: expect.any(Date),
      });
    });

    it('rejects reuse: a code that is already consumed is not returned by the query', async () => {
      usersService.findById.mockResolvedValue(enabledUser);
      repo.find.mockResolvedValue([]);

      await expect(
        service.consumeBackupCode('user-1', 'ABCDEFGHJK'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when no code matches', async () => {
      usersService.findById.mockResolvedValue(enabledUser);
      repo.find.mockResolvedValue(stored);
      bcryptCompare.mockResolvedValue(false);

      await expect(
        service.consumeBackupCode('user-1', 'WRONGCODE2'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(bcryptCompare).toHaveBeenCalledTimes(2);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown user', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.consumeBackupCode('nope', 'ABCDEFGHJK'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when 2FA is not enabled', async () => {
      usersService.findById.mockResolvedValue(setupUser);

      await expect(
        service.consumeBackupCode('user-1', 'ABCDEFGHJK'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.find).not.toHaveBeenCalled();
    });
  });

  describe('regenerateBackupCodes', () => {
    it('invalidates old codes and stores 8 new hashed codes', async () => {
      usersService.findById.mockResolvedValue(enabledUser);
      totpVerify.mockReturnValue(true);

      const { backupCodes } = await service.regenerateBackupCodes(
        'user-1',
        '123456',
      );

      expect(repo.delete).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(backupCodes).toHaveLength(8);
      expect(repo.save.mock.calls[0][0]).toHaveLength(8);
      expect(repo.delete.mock.invocationCallOrder[0]).toBeLessThan(
        repo.save.mock.invocationCallOrder[0],
      );
    });

    it('throws NotFoundException for an unknown user', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.regenerateBackupCodes('nope', '123456'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when 2FA is not enabled', async () => {
      usersService.findById.mockResolvedValue(bareUser);

      await expect(
        service.regenerateBackupCodes('user-1', '123456'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws UnauthorizedException for an invalid code and keeps old codes', async () => {
      usersService.findById.mockResolvedValue(enabledUser);
      totpVerify.mockReturnValue(false);

      await expect(
        service.regenerateBackupCodes('user-1', '000000'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repo.delete).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns the enabled flag', async () => {
      usersService.findById.mockResolvedValue(enabledUser);

      await expect(service.getStatus('user-1')).resolves.toEqual({
        isTwoFactorEnabled: true,
      });
    });

    it('throws NotFoundException for an unknown user', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.getStatus('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
