// uuid v14 is ESM-only and cannot be required from CommonJS Jest, so provide a
// deterministic factory mock (pre-existing repo-wide defect, tracked as follow-up).
jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

// External services are mocked at the module level so loading the controller (and
// the service it depends on) does not pull in their real dependency chains — one
// of which currently fails to parse in this repo (pre-existing defect).
jest.mock('../stellar/stellar.service', () => ({
  StellarService: class StellarService {},
}));
jest.mock('../../users/users.service', () => ({
  UsersService: class UsersService {},
}));
jest.mock('../redis/redis.service', () => ({
  RedisService: class RedisService {},
}));

import { WalletConnectController } from './walletconnect.controller';
import { WalletConnectService } from './walletconnect.service';

describe('WalletConnectController', () => {
  let controller: WalletConnectController;
  let walletConnectService: {
    initPairing: jest.Mock;
    getActiveSessions: jest.Mock;
    disconnectSession: jest.Mock;
    signTransaction: jest.Mock;
    submitSignedTransaction: jest.Mock;
    getGuestBalance: jest.Mock;
    linkAccount: jest.Mock;
  };

  beforeEach(() => {
    walletConnectService = {
      initPairing: jest.fn(),
      getActiveSessions: jest.fn(),
      disconnectSession: jest.fn(),
      signTransaction: jest.fn(),
      submitSignedTransaction: jest.fn(),
      getGuestBalance: jest.fn(),
      linkAccount: jest.fn(),
    };
    controller = new WalletConnectController(
      walletConnectService as unknown as WalletConnectService,
    );
  });

  describe('initPairing', () => {
    it('initializes pairing for the authenticated user', async () => {
      walletConnectService.initPairing.mockResolvedValue({
        pairingUri: 'wc:abc',
        sessionTopic: 'wc:abc',
      });

      const result = await controller.initPairing({ user: { userId: 'u-1' } });

      expect(walletConnectService.initPairing).toHaveBeenCalledWith('u-1');
      expect(result.pairingUri).toBe('wc:abc');
    });
  });

  describe('getSessions', () => {
    it('lists sessions for the authenticated user', async () => {
      walletConnectService.getActiveSessions.mockResolvedValue([]);

      const result = await controller.getSessions({ user: { userId: 'u-1' } });

      expect(walletConnectService.getActiveSessions).toHaveBeenCalledWith(
        'u-1',
      );
      expect(result).toEqual([]);
    });
  });

  describe('disconnectSession', () => {
    it('disconnects the requested session for the authenticated user', async () => {
      walletConnectService.disconnectSession.mockResolvedValue(undefined);

      const result = await controller.disconnectSession(
        { user: { userId: 'u-1' } },
        'wc:topic',
      );

      expect(walletConnectService.disconnectSession).toHaveBeenCalledWith(
        'u-1',
        'wc:topic',
      );
      expect(result).toEqual({ message: 'Session disconnected' });
    });
  });

  describe('signTransaction', () => {
    it('forwards the user, session, operation, and params to the service', async () => {
      walletConnectService.signTransaction.mockResolvedValue({
        signedXdr: 'AAAA',
        submitted: false,
      });
      const body = {
        sessionTopic: 'wc:topic',
        operationType: 'payment' as const,
        params: { destination: 'GXXXX', amount: '10' },
      };

      const result = await controller.signTransaction(
        { user: { userId: 'u-1' } },
        body,
      );

      expect(walletConnectService.signTransaction).toHaveBeenCalledWith(
        'u-1',
        'wc:topic',
        'payment',
        { destination: 'GXXXX', amount: '10' },
      );
      expect(result).toEqual({ signedXdr: 'AAAA', submitted: false });
    });
  });

  describe('submitTransaction', () => {
    it('submits the signed XDR from the request body', async () => {
      walletConnectService.submitSignedTransaction.mockResolvedValue({
        submitted: true,
        txHash: 'hash-1',
      });

      const result = await controller.submitTransaction({
        signedXdr: 'AAAAXDR',
      });

      expect(walletConnectService.submitSignedTransaction).toHaveBeenCalledWith(
        'AAAAXDR',
      );
      expect(result).toEqual({ submitted: true, txHash: 'hash-1' });
    });
  });

  describe('getGuestBalance', () => {
    it('returns balances for a public key without authentication', async () => {
      walletConnectService.getGuestBalance.mockResolvedValue([
        { asset: 'XLM', balance: '1.5' },
      ]);

      const result = await controller.getGuestBalance('GABCDEF123');

      expect(walletConnectService.getGuestBalance).toHaveBeenCalledWith(
        'GABCDEF123',
      );
      expect(result).toEqual([{ asset: 'XLM', balance: '1.5' }]);
    });
  });

  describe('linkAccount', () => {
    it('links the Stellar public key to the authenticated user', async () => {
      walletConnectService.linkAccount.mockResolvedValue({
        linked: true,
        stellarPublicKey: 'GABCDEF123',
      });

      const result = await controller.linkAccount(
        { user: { userId: 'u-1' } },
        { stellarPublicKey: 'GABCDEF123' },
      );

      expect(walletConnectService.linkAccount).toHaveBeenCalledWith(
        'u-1',
        'GABCDEF123',
      );
      expect(result).toEqual({ linked: true, stellarPublicKey: 'GABCDEF123' });
    });
  });
});
