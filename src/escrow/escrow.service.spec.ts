import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EscrowService } from './escrow.service';
import { Escrow, EscrowStatus } from './entities/escrow.entity';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { EncryptionService } from '../common/services/encryption.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

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
    it('creates escrow without moving funds', async () => {
      usersService.findByEmail.mockResolvedValue({ id: 'recipient-id' } as any);
      escrowRepository.create.mockReturnValue(mockEscrow);
      escrowRepository.save.mockResolvedValue(mockEscrow);

      const result = await service.createEscrow('sender-id', {
        recipientEmail: 'recipient@example.com',
        amount: 10,
        currency: 'XLM',
        title: 'Test escrow',
        description: 'Test escrow description',
        releaseCondition: 'Complete work',
      } as any);

      expect(result).toEqual(mockEscrow);
      expect(stellarService.generateWallet).not.toHaveBeenCalled();
      expect(usersService.updateByUserId).not.toHaveBeenCalled();
    });
  });

  describe('fundEscrow', () => {
    it('funds escrow and creates Stellar escrow account', async () => {
      const transactionResult = { hash: 'tx-hash' } as any;
      const keypair = { publicKey: 'escrow-pub', secretKey: 'escrow-secret' };

      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest.fn().mockResolvedValue({ ...mockEscrow, status: EscrowStatus.PENDING }),
          save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
        } as any);
      });

      usersService.findById.mockResolvedValue({ balances: { XLM: 20 } } as any);
      walletsService.resolveWalletForTransaction.mockResolvedValue({ publicKey: 'user-pub', encryptedSecretKey: 'encrypted-key' } as any);
      stellarService.generateWallet.mockResolvedValue(keypair as any);
      encryptionService.encrypt.mockReturnValue('encrypted-secret');
      encryptionService.decrypt.mockReturnValue('user-secret');
      stellarService.sendPayment.mockResolvedValue(transactionResult);

      const result = await service.fundEscrow('sender-id', 'escrow-id');

      expect(result.status).toBe(EscrowStatus.FUNDED);
      expect(result.stellarEscrowPublicKey).toBe('escrow-pub');
      expect(result.stellarEscrowSecretEncrypted).toBe('encrypted-secret');
      expect(result.fundedTxHash).toBe('tx-hash');
    });

    it('throws if escrow not found', async () => {
      dataSource.transaction.mockImplementation(async (_options, fn?) => {
        const callback = typeof _options === 'function' ? _options : fn;
        return callback({
          findOne: jest.fn().mockResolvedValue(null),
        } as any);
      });

      await expect(service.fundEscrow('sender-id', 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('disputeEscrow', () => {
    it('blocks auto-release when disputed', async () => {
      escrowRepository.findOne.mockResolvedValue({ ...mockEscrow, status: EscrowStatus.FUNDED } as any);
      escrowRepository.save.mockResolvedValue({ ...mockEscrow, status: EscrowStatus.DISPUTED } as any);

      const result = await service.disputeEscrow('sender-id', 'escrow-id');

      expect(result.status).toBe(EscrowStatus.DISPUTED);
    });

    it('throws if escrow not funded', async () => {
      escrowRepository.findOne.mockResolvedValue({ ...mockEscrow, status: EscrowStatus.PENDING } as any);

      await expect(service.disputeEscrow('sender-id', 'escrow-id')).rejects.toThrow(BadRequestException);
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
      } as any);

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
          save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
        } as any);
      });

      walletsService.resolveWalletForTransaction.mockResolvedValue({ publicKey: 'sender-pub', encryptedSecretKey: 'encrypted-key' } as any);
      encryptionService.decrypt.mockReturnValue('escrow-secret');
      usersService.findById.mockResolvedValue({ id: 'sender-id', balances: { XLM: 0 } } as any);
      usersService.updateByUserId.mockResolvedValue(undefined);
      stellarService.sendPayment.mockResolvedValue({ hash: 'refund-tx' } as any);

      const result = await service.resolveEscrow('escrow-id', { outcome: 'refund' } as any);

      expect(result.status).toBe(EscrowStatus.REFUNDED);
      expect(result.refundTxHash).toBe('refund-tx');
    });
  });

  describe('getEscrowSecret', () => {
    it('never stores plaintext secret', async () => {
      const escrow = { ...mockEscrow, stellarEscrowSecretEncrypted: 'encrypted' } as any;
      encryptionService.decrypt.mockReturnValue('secret');

      const secret = await (service as any).getEscrowSecret(escrow);
      expect(secret).toBe('secret');
      expect(escrow.stellarEscrowSecretEncrypted).toBe('encrypted');
    });
  });
});
