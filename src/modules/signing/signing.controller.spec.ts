import { SigningController } from './signing.controller';
import { SigningService } from './signing.service';

describe('SigningController', () => {
  let controller: SigningController;
  let signingService: {
    setupKey: jest.Mock;
    confirmSetup: jest.Mock;
    listKeys: jest.Mock;
    revokeKey: jest.Mock;
  };

  beforeEach(() => {
    signingService = {
      setupKey: jest.fn(),
      confirmSetup: jest.fn(),
      listKeys: jest.fn(),
      revokeKey: jest.fn(),
    };
    controller = new SigningController(
      signingService as unknown as SigningService,
    );
  });

  describe('setupKey', () => {
    it('creates a key for the authenticated user', async () => {
      signingService.setupKey.mockResolvedValue({ keyId: 'key-1' });

      const result = await controller.setupKey(
        { user: { id: 'user-1' } },
        { keyName: 'Personal', minAmountUsd: '250' },
      );

      expect(signingService.setupKey).toHaveBeenCalledWith(
        'user-1',
        'Personal',
        '250',
      );
      expect(result).toEqual({ keyId: 'key-1' });
    });

    it('defaults minAmountUsd to "0" when omitted', async () => {
      signingService.setupKey.mockResolvedValue({ keyId: 'key-1' });

      await controller.setupKey({ user: { id: 'user-1' } }, { keyName: 'K' });

      expect(signingService.setupKey).toHaveBeenCalledWith('user-1', 'K', '0');
    });
  });

  describe('confirmKey', () => {
    it('confirms the key with the supplied TOTP code', async () => {
      signingService.confirmSetup.mockResolvedValue({ id: 'key-1' });

      const result = await controller.confirmKey('key-1', {
        totpCode: '123456',
      });

      expect(signingService.confirmSetup).toHaveBeenCalledWith(
        'key-1',
        '123456',
      );
      expect(result).toEqual({ id: 'key-1' });
    });
  });

  describe('listKeys', () => {
    it('lists keys for the authenticated user', async () => {
      signingService.listKeys.mockResolvedValue([{ id: 'key-1' }]);

      const result = await controller.listKeys({ user: { id: 'user-1' } });

      expect(signingService.listKeys).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([{ id: 'key-1' }]);
    });
  });

  describe('revokeKey', () => {
    it('revokes the key and returns a confirmation message', async () => {
      signingService.revokeKey.mockResolvedValue(undefined);

      const result = await controller.revokeKey(
        'key-1',
        { user: { id: 'user-1' } },
        { totpCode: '123456' },
      );

      expect(signingService.revokeKey).toHaveBeenCalledWith(
        'key-1',
        'user-1',
        '123456',
      );
      expect(result).toEqual({ message: 'Key revoked successfully' });
    });
  });
});
