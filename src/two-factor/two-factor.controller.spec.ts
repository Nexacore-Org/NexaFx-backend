import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';
import { AuthService } from '../auth/auth.service';

describe('TwoFactorController', () => {
  let controller: TwoFactorController;
  let twoFactorService: {
    generateSecret: jest.Mock;
    confirmTwoFactor: jest.Mock;
    disableTwoFactor: jest.Mock;
    verifyTotpCode: jest.Mock;
    consumeBackupCode: jest.Mock;
    regenerateBackupCodes: jest.Mock;
    getStatus: jest.Mock;
  };
  let authService: {
    issueFullAccessToken: jest.Mock;
    getUserIdFromPartialAuth: jest.Mock;
  };

  const req = { user: { userId: 'user-1' } };
  const token = { accessToken: 'jwt', expiresIn: 3600 };

  beforeEach(async () => {
    twoFactorService = {
      generateSecret: jest.fn(),
      confirmTwoFactor: jest.fn(),
      disableTwoFactor: jest.fn(),
      verifyTotpCode: jest.fn(),
      consumeBackupCode: jest.fn(),
      regenerateBackupCodes: jest.fn(),
      getStatus: jest.fn(),
    };
    authService = {
      issueFullAccessToken: jest.fn().mockResolvedValue(token),
      getUserIdFromPartialAuth: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TwoFactorController],
      providers: [
        { provide: TwoFactorService, useValue: twoFactorService },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    controller = module.get(TwoFactorController);
  });

  it('setup delegates to generateSecret with the authenticated user', async () => {
    const out = { otpauthUrl: 'u', qrCodeDataUrl: 'q', manualEntryKey: 'k' };
    twoFactorService.generateSecret.mockResolvedValue(out);

    await expect(controller.setup(req)).resolves.toBe(out);
    expect(twoFactorService.generateSecret).toHaveBeenCalledWith('user-1');
  });

  it('confirm returns backup codes from the service', async () => {
    twoFactorService.confirmTwoFactor.mockResolvedValue({ backupCodes: ['A'] });

    await expect(
      controller.confirm(req, { totpCode: '123456' }),
    ).resolves.toEqual({ backupCodes: ['A'] });
    expect(twoFactorService.confirmTwoFactor).toHaveBeenCalledWith(
      'user-1',
      '123456',
    );
  });

  it('confirm propagates UnauthorizedException for a bad code', async () => {
    twoFactorService.confirmTwoFactor.mockRejectedValue(
      new UnauthorizedException(),
    );

    await expect(
      controller.confirm(req, { totpCode: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('disable returns a confirmation message', async () => {
    twoFactorService.disableTwoFactor.mockResolvedValue(undefined);

    await expect(
      controller.disable(req, { totpCode: '123456' }),
    ).resolves.toEqual({ message: 'Two-factor authentication disabled' });
    expect(twoFactorService.disableTwoFactor).toHaveBeenCalledWith(
      'user-1',
      '123456',
    );
  });

  it('disable propagates BadRequestException when 2FA is off', async () => {
    twoFactorService.disableTwoFactor.mockRejectedValue(
      new BadRequestException(),
    );

    await expect(
      controller.disable(req, { totpCode: '123456' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('verify', () => {
    it('issues a full access token when the TOTP code is valid', async () => {
      twoFactorService.verifyTotpCode.mockResolvedValue(true);

      await expect(
        controller.verify(req, { totpCode: '123456' }),
      ).resolves.toBe(token);
      expect(authService.issueFullAccessToken).toHaveBeenCalledWith('user-1');
    });

    it('throws UnauthorizedException and issues no token for an invalid code', async () => {
      twoFactorService.verifyTotpCode.mockResolvedValue(false);

      await expect(
        controller.verify(req, { totpCode: '000000' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authService.issueFullAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('recover', () => {
    const dto = { twoFactorToken: 'partial', backupCode: 'ABCDEFGHJK' };

    it('resolves the user from the partial token, consumes the code and issues a token', async () => {
      authService.getUserIdFromPartialAuth.mockReturnValue('user-1');
      twoFactorService.consumeBackupCode.mockResolvedValue(undefined);

      await expect(controller.recover(dto)).resolves.toBe(token);
      expect(authService.getUserIdFromPartialAuth).toHaveBeenCalledWith('partial');
      expect(twoFactorService.consumeBackupCode).toHaveBeenCalledWith(
        'user-1',
        'ABCDEFGHJK',
      );
      expect(authService.issueFullAccessToken).toHaveBeenCalledWith('user-1');
    });

    it('issues no token when the backup code is rejected', async () => {
      authService.getUserIdFromPartialAuth.mockReturnValue('user-1');
      twoFactorService.consumeBackupCode.mockRejectedValue(
        new UnauthorizedException('Invalid backup code'),
      );

      await expect(controller.recover(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(authService.issueFullAccessToken).not.toHaveBeenCalled();
    });

    it('issues no token when the partial auth token is invalid', async () => {
      authService.getUserIdFromPartialAuth.mockImplementation(() => {
        throw new UnauthorizedException();
      });

      await expect(controller.recover(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(twoFactorService.consumeBackupCode).not.toHaveBeenCalled();
      expect(authService.issueFullAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('regenerate', () => {
    it('returns new backup codes when a TOTP code is supplied', async () => {
      twoFactorService.regenerateBackupCodes.mockResolvedValue({
        backupCodes: ['X'],
      });

      await expect(controller.regenerate(req, '123456')).resolves.toEqual({
        backupCodes: ['X'],
      });
      expect(twoFactorService.regenerateBackupCodes).toHaveBeenCalledWith(
        'user-1',
        '123456',
      );
    });

    it('rejects a missing TOTP code before hitting the service', async () => {
      await expect(
        controller.regenerate(req, undefined as unknown as string),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(twoFactorService.regenerateBackupCodes).not.toHaveBeenCalled();
    });
  });

  it('status returns the service result', async () => {
    twoFactorService.getStatus.mockResolvedValue({ isTwoFactorEnabled: true });

    await expect(controller.status(req)).resolves.toEqual({
      isTwoFactorEnabled: true,
    });
    expect(twoFactorService.getStatus).toHaveBeenCalledWith('user-1');
  });
});
