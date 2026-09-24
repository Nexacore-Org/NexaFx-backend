import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { EmbeddedService } from './embedded.service';
import { EmbeddedPartner } from './entities/embedded-partner.entity';
import { PartnerUser } from './entities/partner-user.entity';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { mock, DeepMockProxy } from 'jest-mock-extended';
import * as bcrypt from 'bcrypt';

describe('EmbeddedService', () => {
  let service: EmbeddedService;
  let partnerRepo: DeepMockProxy<ReturnType<typeof mockPartnerRepo>>;
  let partnerUserRepo: DeepMockProxy<ReturnType<typeof mockPartnerUserRepo>>;
  let usersService: DeepMockProxy<UsersService>;
  let walletsService: DeepMockProxy<WalletsService>;
  let jwtService: DeepMockProxy<JwtService>;

  const mockPartnerRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  });

  const mockPartnerUserRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddedService,
        {
          provide: getRepositoryToken(EmbeddedPartner),
          useFactory: mockPartnerRepo,
        },
        {
          provide: getRepositoryToken(PartnerUser),
          useFactory: mockPartnerUserRepo,
        },
        {
          provide: UsersService,
          useValue: mock<UsersService>(),
        },
        {
          provide: WalletsService,
          useValue: mock<WalletsService>(),
        },
        {
          provide: JwtService,
          useValue: mock<JwtService>(),
        },
      ],
    }).compile();

    service = module.get<EmbeddedService>(EmbeddedService);
    partnerRepo = module.get(getRepositoryToken(EmbeddedPartner));
    partnerUserRepo = module.get(getRepositoryToken(PartnerUser));
    usersService = module.get(UsersService);
    walletsService = module.get(WalletsService);
    jwtService = module.get(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPartner', () => {
    it('should create a new partner with a hashed secret', async () => {
      const dto = { name: 'Test Partner', webhookUrl: 'https://example.com' };
      const partner = { id: '1', ...dto } as EmbeddedPartner;

      partnerRepo.create.mockReturnValue(partner);
      partnerRepo.save.mockResolvedValue(partner);

      const result = await service.createPartner(dto);

      expect(result.partner).toEqual(partner);
      expect(result.clientSecret).toBeDefined();
      expect(partnerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: dto.name,
          clientSecretHash: expect.any(String),
        }),
      );
    });
  });

  describe('authenticatePartner', () => {
    it('should authenticate a partner and return a JWT', async () => {
      const partner = {
        id: '1',
        clientId: 'test-client',
        clientSecretHash: await bcrypt.hash('test-secret', 12),
        isActive: true,
        allowedScopes: ['read'],
      } as EmbeddedPartner;

      const partnerUser = { nexafxUserId: 'user-123' } as PartnerUser;

      partnerRepo.findOne.mockResolvedValue(partner);
      partnerUserRepo.findOne.mockResolvedValue(partnerUser);
      jwtService.sign.mockReturnValue('test-token');

      const result = await service.authenticatePartner(
        'test-client',
        'test-secret',
        'partner-user-123',
      );

      expect(result.access_token).toBe('test-token');
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: 'user-123',
          partnerId: '1',
          scopes: ['read'],
          embedded: true,
        },
        { expiresIn: '1h' },
      );
    });

    it('should create a new partner user if one does not exist', async () => {
      const partner = {
        id: '1',
        clientId: 'test-client',
        clientSecretHash: await bcrypt.hash('test-secret', 12),
        isActive: true,
      } as EmbeddedPartner;

      partnerRepo.findOne.mockResolvedValue(partner);
      partnerUserRepo.findOne.mockResolvedValue(null);
      usersService.createEmbeddedUser.mockResolvedValue({
        id: 'new-user',
      } as any);
      walletsService.createWallet.mockResolvedValue({} as any);
      partnerUserRepo.create.mockImplementation((u) => u as any);
      partnerUserRepo.save.mockResolvedValue({} as any);

      await service.authenticatePartner(
        'test-client',
        'test-secret',
        'new-partner-user',
      );

      expect(usersService.createEmbeddedUser).toHaveBeenCalled();
      expect(walletsService.createWallet).toHaveBeenCalledWith(
        'new-user',
        'XLM',
      );
      expect(partnerUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          partnerId: '1',
          partnerUserId: 'new-partner-user',
          nexafxUserId: 'new-user',
        }),
      );
    });

    it('should throw an error for an invalid client secret', async () => {
      const partner = {
        id: '1',
        clientId: 'test-client',
        clientSecretHash: await bcrypt.hash('test-secret', 12),
        isActive: true,
      } as EmbeddedPartner;

      partnerRepo.findOne.mockResolvedValue(partner);

      await expect(
        service.authenticatePartner('test-client', 'wrong-secret', 'user-123'),
      ).rejects.toThrow(Error);
    });
  });

  describe('updatePartner', () => {
    it('should update a partner', async () => {
      const partner = { id: '1', name: 'Old Name' } as EmbeddedPartner;
      partnerRepo.findOne.mockResolvedValue(partner);
      partnerRepo.save.mockImplementation((p) => Promise.resolve(p as any));

      const updated = await service.updatePartner('1', { name: 'New Name' });

      expect(updated.name).toBe('New Name');
    });

    it('should throw an error if the partner is not found', async () => {
      partnerRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updatePartner('1', { name: 'New Name' }),
      ).rejects.toThrow(Error);
    });
  });

  describe('getPartnerUser', () => {
    it('should return a partner user', async () => {
      const partnerUser = { nexafxUserId: 'user-123' } as PartnerUser;
      partnerUserRepo.findOne.mockResolvedValue(partnerUser);

      const result = await service.getPartnerUser('user-123');

      expect(result).toEqual(partnerUser);
    });
  });
});
