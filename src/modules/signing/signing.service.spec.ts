import * as speakeasy from 'speakeasy';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SigningService } from './signing.service';
import { TransactionSigningKey } from './entities/transaction-signing-key.entity';

const mockKeyRepo = () => {
  const repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    remove: jest.Mock;
  } = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
  };
  return repo;
};

describe('SigningService', () => {
  let service: SigningService;
  let keyRepo: ReturnType<typeof mockKeyRepo>;
  let storedKey: Partial<TransactionSigningKey> | null;

  beforeEach(() => {
    storedKey = null;
    keyRepo = mockKeyRepo();
    keyRepo.create.mockImplementation((entity) => ({
      id: 'key-1',
      ...entity,
    }));
    keyRepo.save.mockImplementation((entity) => {
      storedKey = entity;
      return Promise.resolve(entity);
    });
    keyRepo.findOne.mockImplementation(() => Promise.resolve(storedKey));
    keyRepo.find.mockResolvedValue([]);
    keyRepo.remove.mockResolvedValue(undefined);

    service = new SigningService(keyRepo as any);
  });

  describe('setupKey', () => {
    it('creates an inactive key whose stored secret is encrypted, never plaintext', async () => {
      const result = await service.setupKey('user-1', 'Personal', '100');

      expect(result.secret).toBeDefined();
      expect(result.keyId).toBe('key-1');

      // The stored TOTP secret must be AES-256-GCM output (iv:authTag:ciphertext),
      // not the plaintext base32 secret.
      expect(storedKey!.totpSecret).not.toBe(result.secret);
      expect(storedKey!.totpSecret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

      expect(storedKey).toMatchObject({
        userId: 'user-1',
        keyName: 'Personal',
        isActive: false,
        minAmountUsd: '100',
      });
      expect(keyRepo.save).toHaveBeenCalled();
    });

    it('defaults minAmountUsd to "0" when not provided', async () => {
      await service.setupKey('user-1', 'Personal', '');

      expect(storedKey!.minAmountUsd).toBe('0');
    });

    it('stores a TOTP secret that can later be decrypted and verified', async () => {
      const { secret } = await service.setupKey('user-1', 'Personal', '0');

      const token = speakeasy.totp({ secret, encoding: 'base32' });
      await service.confirmSetup('key-1', token);

      expect(storedKey!.isActive).toBe(true);
    });
  });

  describe('confirmSetup', () => {
    it('throws NotFoundException when the key does not exist', async () => {
      keyRepo.findOne.mockResolvedValue(null);

      await expect(service.confirmSetup('missing', '123456')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the key is already active', async () => {
      storedKey = { id: 'key-1', isActive: true, totpSecret: 'iv:tag:data' };

      await expect(service.confirmSetup('key-1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws UnauthorizedException for an invalid TOTP code', async () => {
      await service.setupKey('user-1', 'Personal', '0');

      await expect(service.confirmSetup('key-1', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(storedKey!.isActive).toBe(false);
    });

    it('activates the key with a valid TOTP code and stamps activatedAt', async () => {
      const { secret } = await service.setupKey('user-1', 'Personal', '0');
      const token = speakeasy.totp({ secret, encoding: 'base32' });

      const result = await service.confirmSetup('key-1', token);

      expect(result.isActive).toBe(true);
      expect(result.activatedAt).toBeInstanceOf(Date);
    });
  });

  describe('listKeys', () => {
    it('masks the TOTP secret so it is never exposed in full', async () => {
      const { secret } = await service.setupKey('user-1', 'Personal', '0');
      keyRepo.find.mockResolvedValue([
        {
          id: 'key-1',
          keyName: 'Personal',
          isActive: false,
          activatedAt: null,
          lastUsedAt: null,
          minAmountUsd: '0',
          totpSecret: storedKey!.totpSecret,
          createdAt: new Date(),
        },
      ]);

      const keys = await service.listKeys('user-1');

      expect(keys).toHaveLength(1);
      expect(keys[0].totpSecret).toMatch(/^[0-9a-f]{4}\*{4}$/);
      expect(keys[0].totpSecret).not.toContain(secret);
      expect(keys[0].totpSecret).not.toContain(storedKey!.totpSecret);
    });

    it('queries by the requesting user with newest keys first', async () => {
      await service.listKeys('user-1');

      expect(keyRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('revokeKey', () => {
    it('throws NotFoundException for a key that does not exist', async () => {
      keyRepo.findOne.mockResolvedValue(null);

      await expect(
        service.revokeKey('missing', 'user-1', '123456'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a key owned by another user', async () => {
      storedKey = {
        id: 'key-1',
        userId: 'other-user',
        isActive: false,
        totpSecret: 'iv:tag:data',
      };
      // findOne is scoped by { id, userId }, so a different user's key is not visible.
      keyRepo.findOne.mockImplementation(
        (opts: { where: { userId: string } }) =>
          Promise.resolve(
            opts.where.userId === storedKey!.userId ? storedKey : null,
          ),
      );

      await expect(
        service.revokeKey('key-1', 'user-1', '123456'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException when revoking an active key with an invalid TOTP code', async () => {
      const { secret } = await service.setupKey('user-1', 'Personal', '0');
      const token = speakeasy.totp({ secret, encoding: 'base32' });
      await service.confirmSetup('key-1', token);

      await expect(
        service.revokeKey('key-1', 'user-1', '000000'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('revokes an active key when the TOTP code is valid', async () => {
      const { secret } = await service.setupKey('user-1', 'Personal', '0');
      const token = speakeasy.totp({ secret, encoding: 'base32' });
      await service.confirmSetup('key-1', token);

      await service.revokeKey('key-1', 'user-1', token);

      expect(keyRepo.remove).toHaveBeenCalledWith(storedKey);
    });

    it('revokes an inactive (never activated) key without requiring a TOTP code', async () => {
      await service.setupKey('user-1', 'Personal', '0');

      await service.revokeKey('key-1', 'user-1', '');

      expect(keyRepo.remove).toHaveBeenCalled();
    });
  });

  describe('validateSigning', () => {
    it('throws NotFoundException when the key is missing or inactive', async () => {
      keyRepo.findOne.mockResolvedValue(null);
      await expect(
        service.validateSigning('missing', '123456'),
      ).rejects.toThrow(NotFoundException);

      storedKey = { id: 'key-1', isActive: false, totpSecret: 'iv:tag:data' };
      await expect(service.validateSigning('key-1', '123456')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnauthorizedException for an invalid TOTP code on an active key', async () => {
      const { secret } = await service.setupKey('user-1', 'Personal', '0');
      const token = speakeasy.totp({ secret, encoding: 'base32' });
      await service.confirmSetup('key-1', token);

      await expect(service.validateSigning('key-1', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns true for a valid code and records lastUsedAt', async () => {
      const { secret } = await service.setupKey('user-1', 'Personal', '0');
      const token = speakeasy.totp({ secret, encoding: 'base32' });
      await service.confirmSetup('key-1', token);

      const result = await service.validateSigning('key-1', token);

      expect(result).toBe(true);
      expect(storedKey!.lastUsedAt).toBeInstanceOf(Date);
    });

    it('rejects a signing request with a revoked (removed) key', async () => {
      const { secret } = await service.setupKey('user-1', 'Personal', '0');
      const token = speakeasy.totp({ secret, encoding: 'base32' });
      await service.confirmSetup('key-1', token);
      await service.revokeKey('key-1', 'user-1', token);

      keyRepo.findOne.mockResolvedValue(null);
      await expect(service.validateSigning('key-1', token)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUserKeys', () => {
    it('returns only active keys ordered by minAmountUsd ascending', async () => {
      await service.getUserKeys('user-1');

      expect(keyRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1', isActive: true },
        order: { minAmountUsd: 'ASC' },
      });
    });
  });

  describe('requiresSigning', () => {
    it('returns false when the user has no active signing keys', async () => {
      keyRepo.find.mockResolvedValue([]);

      expect(await service.requiresSigning('user-1', '500')).toBe(false);
    });

    it('returns false when the amount is below every key threshold', async () => {
      keyRepo.find.mockResolvedValue([
        { minAmountUsd: '100' },
        { minAmountUsd: '1000' },
      ]);

      expect(await service.requiresSigning('user-1', '50')).toBe(false);
    });

    it('returns true when the amount meets a key threshold', async () => {
      keyRepo.find.mockResolvedValue([
        { minAmountUsd: '100' },
        { minAmountUsd: '1000' },
      ]);

      expect(await service.requiresSigning('user-1', '100')).toBe(true);
      expect(await service.requiresSigning('user-1', '2500')).toBe(true);
    });
  });
});
