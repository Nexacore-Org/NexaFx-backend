// uuid v14 is ESM-only and cannot be required from CommonJS Jest, so provide a
// deterministic factory mock (pre-existing repo-wide defect, tracked as follow-up).
jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

// External services are mocked at the module level so loading the service under
// test does not pull in their real dependency chains (one of which currently
// fails to parse in this repo — pre-existing defect, tracked as a follow-up).
jest.mock('../stellar/stellar.service', () => ({
  StellarService: class StellarService {},
}));
jest.mock('../../users/users.service', () => ({
  UsersService: class UsersService {},
}));
jest.mock('../redis/redis.service', () => ({
  RedisService: class RedisService {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletConnectService } from './walletconnect.service';
import { WalletConnectSession } from './entities/walletconnect-session.entity';

const SESSION_TTL_DAYS = 7;

describe('WalletConnectService', () => {
  let service: WalletConnectService;
  let sessionRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let stellarService: {
    server: { submitTransaction: jest.Mock; loadAccount: jest.Mock };
    networkPassphrase: string;
    getWalletBalances: jest.Mock;
  };
  let usersService: { findById: jest.Mock; update: jest.Mock };
  let storedSession: Partial<WalletConnectSession> | null;

  beforeEach(() => {
    storedSession = null;
    sessionRepo = {
      create: jest.fn().mockImplementation((entity) => ({
        id: 'session-1',
        ...entity,
      })),
      save: jest.fn().mockImplementation((entity) => {
        storedSession = entity;
        return Promise.resolve(entity);
      }),
      findOne: jest
        .fn()
        .mockImplementation(() => Promise.resolve(storedSession)),
      find: jest.fn().mockResolvedValue([]),
    };
    stellarService = {
      server: {
        submitTransaction: jest.fn(),
        loadAccount: jest.fn(),
      },
      networkPassphrase: 'Test SDF Network ; September 2015',
      getWalletBalances: jest.fn(),
    };
    usersService = {
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    service = new WalletConnectService(
      sessionRepo as any,
      stellarService as any,
      usersService as any,
      {} as any,
    );
  });

  describe('initPairing', () => {
    it('creates a session valid for 7 days and returns a pairing URI', async () => {
      const before = new Date();
      const result = await service.initPairing('user-1');
      const after = new Date();

      expect(result.sessionTopic).toMatch(/^wc:[0-9a-f]{32}$/);
      expect(result.pairingUri).toMatch(/^wc:/);
      expect(result.pairingUri).toContain(`relay-protocol=irn`);
      expect(result.pairingUri).toContain(`symKey=`);

      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTopic: result.sessionTopic,
          walletPublicKey: '',
          peerMetadata: {},
          nexafxUserId: 'user-1',
          isActive: true,
        }),
      );
      expect(sessionRepo.save).toHaveBeenCalled();

      const expiresAt = storedSession!.expiresAt as Date;
      const ttlMs = expiresAt.getTime() - before.getTime();
      expect(ttlMs).toBeGreaterThanOrEqual(
        (SESSION_TTL_DAYS - 1) * 24 * 60 * 60 * 1000,
      );
      expect(expiresAt.getTime()).toBeLessThanOrEqual(
        after.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
      );
    });
  });

  describe('approveSession', () => {
    it('throws NotFoundException for an unknown session topic', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.approveSession('wc:unknown', 'GABC', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('binds the wallet public key and peer metadata to the session', async () => {
      storedSession = {
        id: 'session-1',
        sessionTopic: 'wc:topic',
        walletPublicKey: '',
        peerMetadata: {},
        isActive: true,
      };

      const result = await service.approveSession('wc:topic', 'GABCDEF123', {
        name: 'Albedo',
        url: 'https://albedo.link',
      });

      expect(result.walletPublicKey).toBe('GABCDEF123');
      expect(result.peerMetadata).toEqual({
        name: 'Albedo',
        url: 'https://albedo.link',
      });
      expect(result.isActive).toBe(true);
      expect(sessionRepo.save).toHaveBeenCalled();
    });
  });

  describe('getActiveSessions', () => {
    it('lists only the user’s active, non-expired sessions as ISO strings', async () => {
      const now = new Date();
      const active = {
        id: 's-1',
        sessionTopic: 'wc:active',
        walletPublicKey: 'G1',
        peerMetadata: {},
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        isActive: true,
        createdAt: new Date('2026-08-01T00:00:00Z'),
      };
      const expired = {
        id: 's-2',
        sessionTopic: 'wc:expired',
        walletPublicKey: 'G2',
        peerMetadata: {},
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
        isActive: true,
        createdAt: new Date('2026-07-01T00:00:00Z'),
      };
      sessionRepo.find.mockResolvedValue([active, expired]);

      const result = await service.getActiveSessions('user-1');

      expect(sessionRepo.find).toHaveBeenCalledWith({
        where: { nexafxUserId: 'user-1', isActive: true },
        order: { createdAt: 'DESC' },
      });
      // The expired session is excluded.
      expect(result.map((s) => s.sessionTopic)).toEqual(['wc:active']);
      expect(result[0].expiresAt).toBe(
        new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      );
      expect(result[0].createdAt).toBe('2026-08-01T00:00:00.000Z');
    });

    it('treats sessions without an expiry as active', async () => {
      sessionRepo.find.mockResolvedValue([
        {
          id: 's-1',
          sessionTopic: 'wc:no-expiry',
          walletPublicKey: 'G1',
          peerMetadata: {},
          expiresAt: null,
          isActive: true,
          createdAt: new Date('2026-08-01T00:00:00Z'),
        },
      ]);

      const result = await service.getActiveSessions('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].expiresAt).toBeNull();
    });
  });

  describe('disconnectSession', () => {
    it('throws NotFoundException for a session the user does not own', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.disconnectSession('user-1', 'wc:unknown'),
      ).rejects.toThrow(NotFoundException);
    });

    it('invalidates the session for any subsequent request', async () => {
      storedSession = {
        id: 'session-1',
        sessionTopic: 'wc:topic',
        nexafxUserId: 'user-1',
        isActive: true,
      };

      await service.disconnectSession('user-1', 'wc:topic');

      expect(storedSession.isActive).toBe(false);
      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
      expect(sessionRepo.findOne).toHaveBeenCalledWith({
        where: { sessionTopic: 'wc:topic', nexafxUserId: 'user-1' },
      });
    });
  });

  describe('signTransaction', () => {
    const validSession = () => ({
      id: 'session-1',
      sessionTopic: 'wc:topic',
      nexafxUserId: 'user-1',
      isActive: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      walletPublicKey: 'GABCDEF123',
    });

    it('throws NotFoundException when there is no active session', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.signTransaction('user-1', 'wc:topic', 'payment', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for an expired session', async () => {
      storedSession = {
        ...validSession(),
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      };

      await expect(
        service.signTransaction('user-1', 'wc:topic', 'payment', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('builds an unsigned XDR for an active session', async () => {
      storedSession = validSession();
      jest
        .spyOn(service as any, 'buildStellarXDR')
        .mockResolvedValue('AAAAXDR');

      const result = await service.signTransaction(
        'user-1',
        'wc:topic',
        'payment',
        { destination: 'GXXXX', amount: '10' },
      );

      expect(service['buildStellarXDR']).toHaveBeenCalledWith(
        'payment',
        { destination: 'GXXXX', amount: '10' },
        'GABCDEF123',
      );
      expect(result).toEqual({ signedXdr: 'AAAAXDR', submitted: false });
    });

    it('rejects an unsupported operation type', async () => {
      stellarService.server.loadAccount.mockResolvedValue({});

      await expect(
        (service as any).buildStellarXDR('unsupported_op', {}, 'GABCDEF123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitSignedTransaction', () => {
    it('submits the signed XDR and returns the transaction hash', async () => {
      stellarService.server.submitTransaction.mockResolvedValue({
        hash: 'tx-hash-1',
      });

      const result = await service.submitSignedTransaction('AAAAXDR');

      expect(stellarService.server.submitTransaction).toHaveBeenCalledWith(
        'AAAAXDR',
      );
      expect(result).toEqual({ submitted: true, txHash: 'tx-hash-1' });
    });

    it('throws BadRequestException when Stellar rejects the submission', async () => {
      stellarService.server.submitTransaction.mockRejectedValue(
        new Error('tx failed'),
      );

      await expect(service.submitSignedTransaction('BADXDR')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getGuestBalance', () => {
    it('delegates to the Stellar service for the given public key', async () => {
      stellarService.getWalletBalances.mockResolvedValue([
        { asset: 'XLM', balance: '25.5' },
      ]);

      const result = await service.getGuestBalance('GABCDEF123');

      expect(stellarService.getWalletBalances).toHaveBeenCalledWith(
        'GABCDEF123',
      );
      expect(result).toEqual([{ asset: 'XLM', balance: '25.5' }]);
    });
  });

  describe('linkAccount', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.linkAccount('user-1', 'GABCDEF123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('links the Stellar public key to the user’s wallet address', async () => {
      usersService.findById.mockResolvedValue({ id: 'user-1' });

      const result = await service.linkAccount('user-1', 'GABCDEF123');

      expect(usersService.update).toHaveBeenCalledWith('user-1', {
        walletAddress: 'GABCDEF123',
      });
      expect(result).toEqual({ linked: true, stellarPublicKey: 'GABCDEF123' });
    });
  });
});
