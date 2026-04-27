import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { TwoFactorService } from './two-factor.service';
import { UsersService } from '../users/users.service';
import { EncryptionService } from '../common/services/encryption.service';
import { BackupCode } from './entities/backup-code.entity';

describe('TwoFactorService backup codes', () => {
  let service: TwoFactorService;
  let repo: {
    delete: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
  };

  const usersService = {
    findById: jest.fn(async () => ({
      id: 'user-1',
      email: 'user@example.com',
      twoFactorSecret: 'enc',
      isTwoFactorEnabled: true,
      isVerified: true,
    })),
    updateByUserId: jest.fn(async () => undefined),
  };

  const encryptionService = {
    decrypt: jest.fn(() => 'JBSWY3DPEHPK3PXP'),
    encrypt: jest.fn((v: string) => `enc:${v}`),
  };

  beforeEach(async () => {
    repo = {
      delete: jest.fn(async () => ({ affected: 0 })),
      save: jest.fn(async (v: any) => v),
      create: jest.fn((v: any) => v),
      find: jest.fn(async () => []),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: UsersService, useValue: usersService },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: getRepositoryToken(BackupCode), useValue: repo },
      ],
    }).compile();

    service = moduleRef.get(TwoFactorService);
  });

  it('consumes a backup code so it cannot be reused', async () => {
    const consumedAt = null;
    const record: BackupCode = {
      id: 'bc-1',
      userId: 'user-1',
      codeHash: await (await import('bcrypt')).hash('ABCDEF1234', 10),
      consumedAt,
      createdAt: new Date(),
    };

    repo.find = jest.fn(async () => [record]);

    await service.recoverWithBackupCode('user-1', 'ABCDEF1234');

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ consumedAt: expect.any(Date) }),
    );

    // Second attempt should fail because repository would now have none unconsumed.
    repo.find = jest.fn(async () => []);
    await expect(
      service.recoverWithBackupCode('user-1', 'ABCDEF1234'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('regenerate consumes all old codes (deletes) and returns 8 new ones', async () => {
    jest
      .spyOn<any, any>(service as any, 'verifyTotp')
      .mockReturnValueOnce(true);

    const res = await service.regenerateBackupCodes('user-1', '123456');
    expect(repo.delete).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(res.backupCodes).toHaveLength(8);
  });
});

