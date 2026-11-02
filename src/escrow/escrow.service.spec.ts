import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

jest.mock('@nestjs/typeorm', () => {
  const { Inject } = require('@nestjs/common');
  const getRepositoryToken = (entity: any) =>
    `${entity?.name ?? 'Entity'}Repository`;
  return {
    InjectRepository: (entity: any) => Inject(getRepositoryToken(entity)),
    getRepositoryToken,
    TypeOrmModule: { forFeature: () => ({}) },
  };
});

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => {},
  CronExpression: {
    EVERY_5_MINUTES: '*/5 * * * *',
    EVERY_HOUR: '0 * * * *',
  },
}));

jest.mock('@nestjs/swagger', () => {
  const noop = () => () => {};
  return {
    ApiTags: noop,
    ApiOperation: noop,
    ApiResponse: noop,
    ApiBearerAuth: noop,
    ApiBody: noop,
    ApiParam: noop,
    ApiQuery: noop,
    ApiProperty: noop,
    ApiPropertyOptional: noop,
    PartialType: (cls: any) => cls,
    OmitType: (cls: any) => cls,
    PickType: (cls: any) => cls,
  };
});

jest.mock('../users/users.service', () => ({
  UsersService: class {},
}));

jest.mock('../wallets/wallets.service', () => ({
  WalletsService: class {},
}));

jest.mock('../blockchain/stellar/stellar.service', () => ({
  StellarService: class {},
}));

jest.mock('../common/services/encryption.service', () => ({
  EncryptionService: class {},
}));

jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));

import {
  EscrowService,
  INVALID_ESCROW_RECIPIENT_MESSAGE,
} from './escrow.service';
import { Escrow, EscrowStatus } from './entities/escrow.entity';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { EncryptionService } from '../common/services/encryption.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

describe('EscrowService', () => {
  let service: EscrowService;
  let escrowRepository: jest.Mocked<Repository<Escrow>>;
  let usersService: jest.Mocked<UsersService>;
  let walletsService: jest.Mocked<WalletsService>;
  let stellarService: jest.Mocked<StellarService>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let dataSource: { transaction: jest.Mock };

  const mockEscrow: Escrow = {
    id: 'escrow-id',
    senderId: 'sender-id',
    recipientId: 'recipient-id',
    amount: '10.00000000',
    currency: 'XLM',
    title: 'Test escrow',
    description: 'Test escrow description',
    status: EscrowStatus.PENDING,
    releaseCondition: 'Complete work',
    autoReleaseAt: null,
    disputeWindowHours: 24,
    stellarEscrowPublicKey: null,
    stellarEscrowSecretEncrypted: null,
    fundedTxHash: null,
    releaseTxHash: null,
    refundTxHash: null,
    createdAt: new Date(),
    fundedAt: null,
    releasedAt: null,
    updatedAt: new Date(),
    sender: undefined as any,
    recipient: undefined as any,
  };

  const createRepositoryMock = () => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  });

  const createDataSourceMock = () => ({
    transaction: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscrowService,
        {
          provide: getRepositoryToken(Escrow),
          useValue: createRepositoryMock(),
        },
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            updateByUserId: jest.fn(),
          },
        },
        {
          provide: WalletsService,
          useValue: {
            resolveWalletForTransaction: jest.fn(),
          },
        },
        {
          provide: StellarService,
          useValue: {
            generateWallet: jest.fn(),
            sendPayment: jest.fn(),
            createEscrowAccount: jest.fn(),
            closeEscrowAccount: jest.fn(),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn(),
            decrypt: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: DataSource,
          useValue: createDataSourceMock(),
        },
      ],
    }).compile();

    service = module.get<EscrowService>(EscrowService);
    escrowRepository = module.get(getRepositoryToken(Escrow));
    usersService = module.get(UsersService);
    walletsService = module.get(WalletsService);
    stellarService = module.get(StellarService);
    encryptionService = module.get(EncryptionService);
    notificationsService = module.get(NotificationsService);
    dataSource = module.get(DataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createEscrow', () => {
    const validDto = {
      recipientEmail: 'recipient@example.com',
      amount: 10,
      currency: 'XLM',
      title: 'Test escrow',
      description: 'Test escrow description',
      releaseCondition: 'Complete work',
    };

    it('creates escrow without moving funds', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'recipient-id',
        isVerified: true,
        isActive: true,
        isSuspended: false,
        isDeleted: false,
      } as any);
      escrowRepository.create.mockReturnValue(mockEscrow);
      escrowRepository.save.mockResolvedValue(mockEscrow);

      const result = await service.createEscrow('sender-id', validDto);

      expect(result).toEqual(mockEscrow);
      expect(stellarService.generateWallet).not.toHaveBeenCalled();
      expect(usersService.updateByUserId).not.toHaveBeenCalled();
    });

    it('rejects self-escrow', async () => {
      usersService.findByEmail.mockResolvedValue({ id: 'sender-id' } as any);

      await expect(
        service.createEscrow('sender-id', {
          ...validDto,
          recipientEmail: 'sender@example.com',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(escrowRepository.save).not.toHaveBeenCalled();
    });

    it('returns a generic BadRequestException for an unknown email indistinguishable from an ineligible known email (#1487)', async () => {
      usersService.findByEmail.mockResolvedValueOnce(null);
      let unknownEmailError: Error | undefined;
      try {
        await service.createEscrow('sender-id', {
          ...validDto,
          recipientEmail: 'unknown@example.com',
        });
      } catch (err) {
        unknownEmailError = err as Error;
      }

      usersService.findByEmail.mockResolvedValueOnce({
        id: 'recipient-id',
        isSuspended: true,
        isVerified: true,
        isActive: true,
      } as any);
      let suspendedEmailError: Error | undefined;
      try {
        await service.createEscrow('sender-id', {
          ...validDto,
          recipientEmail: 'suspended@example.com',
        });
      } catch (err) {
        suspendedEmailError = err as Error;
      }

      expect(unknownEmailError).toBeInstanceOf(BadRequestException);
      expect(suspendedEmailError).toBeInstanceOf(BadRequestException);
      expect(unknownEmailError?.message).toBe(INVALID_ESCROW_RECIPIENT_MESSAGE);
      expect(suspendedEmailError?.message).toBe(unknownEmailError?.message);
      expect(escrowRepository.save).not.toHaveBeenCalled();
    });

    it.each([
      [
        'suspended',
        { id: 'recipient-id', isSuspended: true, isVerified: true },
      ],
      ['deleted', { id: 'recipient-id', isDeleted: true, isVerified: true }],
      [
        'deactivated',
        { id: 'recipient-id', isActive: false, isVerified: true },
      ],
      [
        'unverified (isVerified=false)',
        { id: 'recipient-id', isVerified: false },
      ],
      [
        'unverified (isEmailVerified=false)',
        { id: 'recipient-id', isEmailVerified: false },
      ],
    ])(
      'rejects %s recipient with BadRequestException (#1487)',
      async (_label, recipient) => {
        usersService.findByEmail.mockResolvedValue(recipient as any);

        await expect(
          service.createEscrow('sender-id', validDto),
        ).rejects.toThrow(
          new BadRequestException(INVALID_ESCROW_RECIPIENT_MESSAGE),
        );
        expect(escrowRepository.save).not.toHaveBeenCalled();
      },
    );

    it('rejects creating escrow when sender has reached maximum pending escrows (#1487)', async () => {
      escrowRepository.count.mockResolvedValueOnce(20);

      await expect(service.createEscrow('sender-id', validDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });

    it.each([0, -1])('rejects non-positive amount %s', async (amount) => {
      await expect(
        service.createEscrow('sender-id', {
          ...validDto,
          amount,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });

    it('rejects currencies without an on-chain asset mapping', async () => {
      await expect(
        service.createEscrow('sender-id', {
          ...validDto,
          currency: 'USD',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('cancelEscrow (#1487)', () => {
    it('allows the sender to cancel a PENDING escrow', async () => {
      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest
            .fn()
            .mockResolvedValue({ ...mockEscrow, status: EscrowStatus.PENDING }),
          save: jest
            .fn()
            .mockImplementation((entity) => Promise.resolve(entity)),
        } as any);
      });

      const result = await service.cancelEscrow('sender-id', 'escrow-id');

      expect(result.status).toBe(EscrowStatus.CANCELLED);
    });

    it('forbids non-sender from cancelling a PENDING escrow', async () => {
      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest
            .fn()
            .mockResolvedValue({ ...mockEscrow, status: EscrowStatus.PENDING }),
          save: jest.fn(),
        } as any);
      });

      await expect(
        service.cancelEscrow('recipient-id', 'escrow-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cancelling a non-PENDING escrow', async () => {
      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest
            .fn()
            .mockResolvedValue({ ...mockEscrow, status: EscrowStatus.FUNDED }),
          save: jest.fn(),
        } as any);
      });

      await expect(
        service.cancelEscrow('sender-id', 'escrow-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when escrow does not exist', async () => {
      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        } as any);
      });

      await expect(
        service.cancelEscrow('sender-id', 'missing-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('expireStalePendingEscrows (#1487)', () => {
    it('marks stale PENDING escrows as EXPIRED', async () => {
      const staleEscrow = {
        ...mockEscrow,
        status: EscrowStatus.PENDING,
        createdAt: new Date(Date.now() - 100 * 60 * 60 * 1000),
      };
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([staleEscrow]),
      };
      escrowRepository.createQueryBuilder.mockReturnValue(qb as any);
      escrowRepository.save.mockImplementation(async (e: any) => e);

      const expiredCount = await service.expireStalePendingEscrows();

      expect(expiredCount).toBe(1);
      expect(staleEscrow.status).toBe(EscrowStatus.EXPIRED);
      expect(escrowRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: EscrowStatus.EXPIRED }),
      );
    });
  });

  describe('fundEscrow', () => {
    it('funds escrow and creates Stellar escrow account', async () => {
      const transactionResult = { hash: 'tx-hash' } as any;
      const keypair = { publicKey: 'escrow-pub', secretKey: 'escrow-secret' };

      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest.fn().mockResolvedValue({
            ...mockEscrow,
            status: EscrowStatus.PENDING,
            createdAt: new Date(),
          }),
          save: jest
            .fn()
            .mockImplementation((entity) => Promise.resolve(entity)),
        } as any);
      });

      usersService.findById.mockResolvedValue({ balances: { XLM: 20 } } as any);
      walletsService.resolveWalletForTransaction.mockResolvedValue({
        publicKey: 'user-pub',
        encryptedSecretKey: 'encrypted-key',
      } as any);
      stellarService.generateWallet.mockResolvedValue(keypair);
      encryptionService.encrypt.mockReturnValue('encrypted-secret');
      encryptionService.decrypt.mockReturnValue('user-secret');
      stellarService.createEscrowAccount.mockResolvedValue(transactionResult);
      usersService.updateByUserId.mockResolvedValue(undefined);

      const result = await service.fundEscrow('sender-id', 'escrow-id');

      expect(result.status).toBe(EscrowStatus.FUNDED);
      expect(result.stellarEscrowPublicKey).toBe('escrow-pub');
      expect(result.stellarEscrowSecretEncrypted).toBe('encrypted-secret');
      expect(result.fundedTxHash).toBe('tx-hash');
      expect(stellarService.createEscrowAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: 'escrow-pub',
          amount: '10.00000000',
        }),
      );
      expect(usersService.updateByUserId).toHaveBeenCalledWith(
        'sender-id',
        expect.objectContaining({
          balances: { XLM: 10 },
        }),
      );
    });

    it('expires and rejects funding a stale PENDING escrow (#1487)', async () => {
      const saveMock = jest
        .fn()
        .mockImplementation((entity) => Promise.resolve(entity));
      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest.fn().mockResolvedValue({
            ...mockEscrow,
            status: EscrowStatus.PENDING,
            createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
          }),
          save: saveMock,
        } as any);
      });

      await expect(
        service.fundEscrow('sender-id', 'escrow-id'),
      ).rejects.toThrow(BadRequestException);
      expect(saveMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: EscrowStatus.EXPIRED }),
      );
    });

    it('throws if escrow not found', async () => {
      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest.fn().mockResolvedValue(null),
        } as any);
      });

      await expect(service.fundEscrow('sender-id', 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('disputeEscrow', () => {
    it('blocks auto-release when disputed', async () => {
      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest.fn().mockResolvedValue({
            ...mockEscrow,
            status: EscrowStatus.FUNDED,
            fundedAt: new Date(Date.now() - 1000),
          }),
          save: jest
            .fn()
            .mockImplementation((entity) => Promise.resolve(entity)),
        } as any);
      });

      const result = await service.disputeEscrow('sender-id', 'escrow-id');

      expect(result.status).toBe(EscrowStatus.DISPUTED);
    });

    it('throws if escrow not funded', async () => {
      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest.fn().mockResolvedValue({
            ...mockEscrow,
            status: EscrowStatus.PENDING,
          }),
        } as any);
      });

      await expect(
        service.disputeEscrow('sender-id', 'escrow-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects disputes after the dispute window closes', async () => {
      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest.fn().mockResolvedValue({
            ...mockEscrow,
            status: EscrowStatus.FUNDED,
            fundedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          }),
        } as any);
      });

      await expect(
        service.disputeEscrow('sender-id', 'escrow-id'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('releaseEscrow', () => {
    it('blocks sender release while the dispute window is open', async () => {
      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest.fn().mockResolvedValue({
            ...mockEscrow,
            status: EscrowStatus.FUNDED,
            fundedAt: new Date(),
          }),
        } as any);
      });

      await expect(
        service.releaseEscrow('sender-id', 'escrow-id'),
      ).rejects.toThrow(BadRequestException);
      expect(stellarService.sendPayment).not.toHaveBeenCalled();
    });
  });

  describe('resolveEscrow', () => {
    it('admin refund resolution sends funds back', async () => {
      escrowRepository.findOne.mockResolvedValue({
        ...mockEscrow,
        status: EscrowStatus.FUNDED,
        stellarEscrowPublicKey: 'escrow-pub',
        stellarEscrowSecretEncrypted: 'encrypted-escrow-secret',
        senderId: 'sender-id',
      });

      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest.fn().mockResolvedValue({
            ...mockEscrow,
            status: EscrowStatus.FUNDED,
            stellarEscrowPublicKey: 'escrow-pub',
            stellarEscrowSecretEncrypted: 'encrypted-escrow-secret',
            senderId: 'sender-id',
            recipientId: 'recipient-id',
          }),
          save: jest
            .fn()
            .mockImplementation((entity) => Promise.resolve(entity)),
        } as any);
      });

      walletsService.resolveWalletForTransaction.mockResolvedValue({
        publicKey: 'sender-pub',
        encryptedSecretKey: 'encrypted-key',
      } as any);
      encryptionService.decrypt.mockReturnValue('escrow-secret');
      usersService.findById.mockResolvedValue({
        id: 'sender-id',
        balances: { XLM: 0 },
      } as any);
      usersService.updateByUserId.mockResolvedValue(undefined);
      stellarService.closeEscrowAccount.mockResolvedValue({
        hash: 'refund-tx',
      } as any);

      const result = await service.resolveEscrow('escrow-id', {
        outcome: 'refund',
      } as any);

      expect(result.status).toBe(EscrowStatus.REFUNDED);
      expect(result.refundTxHash).toBe('refund-tx');
    });
  });

  describe('getEscrowSecret', () => {
    it('never stores plaintext secret', async () => {
      const escrow = {
        ...mockEscrow,
        stellarEscrowSecretEncrypted: 'encrypted',
      } as any;
      encryptionService.decrypt.mockReturnValue('secret');

      const secret = await (service as any).getEscrowSecret(escrow);
      expect(secret).toBe('secret');
      expect(escrow.stellarEscrowSecretEncrypted).toBe('encrypted');
    });
  });
});
