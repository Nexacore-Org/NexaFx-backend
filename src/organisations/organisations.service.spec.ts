import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganisationsService } from './organisations.service';
import { Organisation } from './entities/organisation.entity';
import {
  OrganisationMember,
  OrgRole,
  InviteStatus,
} from './entities/organisation-member.entity';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { UsersService } from '../users/users.service';

const mockOrgRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const mockMemberRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

const mockStellarService = () => ({
  generateWallet: jest.fn().mockResolvedValue({
    publicKey: 'GPUBKEY123',
    secretKey: 'SSECRETKEY456',
  }),
});

const mockConfigService = () => ({
  get: jest.fn().mockReturnValue('aaaa' + 'b'.repeat(60)),
});

const mockUsersService = () => ({
  findByEmail: jest.fn().mockResolvedValue(null),
});

const makeOrg = (overrides: Partial<Organisation> = {}): Organisation =>
  ({
    id: 'org-1',
    name: 'Acme Corp',
    description: null,
    walletPublicKey: 'GPUBKEY',
    walletSecretKeyEncrypted: 'encrypted',
    balances: {},
    txLimitPerDay: 10000,
    txLimitPerTx: 1000,
    ownerId: 'user-1',
    members: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Organisation;

const makeMember = (
  overrides: Partial<OrganisationMember> = {},
): OrganisationMember =>
  ({
    id: 'member-1',
    organisationId: 'org-1',
    userId: 'user-1',
    inviteEmail: 'owner@example.com',
    role: OrgRole.OWNER,
    inviteStatus: InviteStatus.ACCEPTED,
    inviteToken: null,
    inviteTokenExpiresAt: null,
    joinedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as OrganisationMember;

describe('OrganisationsService', () => {
  let service: OrganisationsService;
  let orgRepo: ReturnType<typeof mockOrgRepo>;
  let memberRepo: ReturnType<typeof mockMemberRepo>;
  let stellarService: ReturnType<typeof mockStellarService>;
  let usersService: ReturnType<typeof mockUsersService>;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganisationsService,
        { provide: getRepositoryToken(Organisation), useFactory: mockOrgRepo },
        {
          provide: getRepositoryToken(OrganisationMember),
          useFactory: mockMemberRepo,
        },
        { provide: StellarService, useFactory: mockStellarService },
        { provide: ConfigService, useFactory: mockConfigService },
        { provide: UsersService, useFactory: mockUsersService },
      ],
    }).compile();

    service = module.get<OrganisationsService>(OrganisationsService);
    orgRepo = module.get(getRepositoryToken(Organisation));
    memberRepo = module.get(getRepositoryToken(OrganisationMember));
    stellarService = module.get(StellarService);
    usersService = module.get(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── createOrganisation() ──────────────────────────────────────────────────
  describe('createOrganisation()', () => {
    it('throws ConflictException when org name already exists', async () => {
      orgRepo.findOne.mockResolvedValueOnce(makeOrg());

      await expect(
        service.createOrganisation('user-1', {
          name: 'Acme Corp',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates org, creates owner member, and returns org', async () => {
      const org = makeOrg();
      orgRepo.findOne
        .mockResolvedValueOnce(null) // name uniqueness check
        .mockResolvedValueOnce(org); // getOrganisationById at end

      orgRepo.create.mockReturnValue(org);
      orgRepo.save.mockResolvedValue(org);

      const ownerMember = makeMember();
      memberRepo.create.mockReturnValue(ownerMember);
      memberRepo.save.mockResolvedValue(ownerMember);
      memberRepo.findOne.mockResolvedValue(ownerMember); // requireMembership

      const result = await service.createOrganisation('user-1', {
        name: 'Acme Corp',
      });

      expect(stellarService.generateWallet).toHaveBeenCalledWith('user-1');
      expect(orgRepo.save).toHaveBeenCalledTimes(1);
      expect(memberRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          role: OrgRole.OWNER,
          inviteStatus: InviteStatus.ACCEPTED,
        }),
      );
      expect(result).toEqual(org);
    });
  });

  // ─── getUserOrganisations() ────────────────────────────────────────────────
  describe('getUserOrganisations()', () => {
    it('returns orgs the user is an accepted member of', async () => {
      const org = makeOrg();
      const member = makeMember({ organisation: org });
      memberRepo.find.mockResolvedValue([member]);

      const result = await service.getUserOrganisations('user-1');

      expect(memberRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1', inviteStatus: InviteStatus.ACCEPTED },
        relations: ['organisation'],
      });
      expect(result).toEqual([org]);
    });

    it('returns empty array when user has no memberships', async () => {
      memberRepo.find.mockResolvedValue([]);
      const result = await service.getUserOrganisations('user-1');
      expect(result).toEqual([]);
    });
  });

  // ─── getOrganisationById() ─────────────────────────────────────────────────
  describe('getOrganisationById()', () => {
    it('throws ForbiddenException when user is not a member', async () => {
      memberRepo.findOne.mockResolvedValue(null); // requireMembership

      await expect(
        service.getOrganisationById('org-1', 'not-a-member'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when org does not exist', async () => {
      memberRepo.findOne.mockResolvedValue(makeMember());
      orgRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getOrganisationById('org-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns org with members for valid member', async () => {
      const org = makeOrg();
      memberRepo.findOne.mockResolvedValue(makeMember());
      orgRepo.findOne.mockResolvedValue(org);

      const result = await service.getOrganisationById('org-1', 'user-1');
      expect(result).toEqual(org);
    });
  });

  // ─── listMembers() ─────────────────────────────────────────────────────────
  describe('listMembers()', () => {
    it('throws ForbiddenException when user is not a member', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(service.listMembers('org-1', 'outsider')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns members ordered by createdAt ASC', async () => {
      const members = [makeMember(), makeMember({ id: 'member-2' })];
      memberRepo.findOne.mockResolvedValue(makeMember()); // requireMembership
      memberRepo.find.mockResolvedValue(members);

      const result = await service.listMembers('org-1', 'user-1');

      expect(memberRepo.find).toHaveBeenCalledWith({
        where: { organisationId: 'org-1' },
        relations: ['user'],
        order: { createdAt: 'ASC' },
      });
      expect(result).toHaveLength(2);
    });
  });

  // ─── inviteMember() ────────────────────────────────────────────────────────
  describe('inviteMember()', () => {
    it('throws ForbiddenException when actor is not OWNER or ADMIN', async () => {
      memberRepo.findOne.mockResolvedValue(
        makeMember({ role: OrgRole.MEMBER }),
      );

      await expect(
        service.inviteMember('org-1', 'user-1', { email: 'new@example.com' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when ADMIN tries to assign OWNER role', async () => {
      memberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: OrgRole.ADMIN })) // requireMembership
        .mockResolvedValueOnce(null); // existing check

      await expect(
        service.inviteMember('org-1', 'admin-1', {
          email: 'new@example.com',
          role: OrgRole.OWNER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when email is already an accepted member', async () => {
      memberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: OrgRole.OWNER })) // actor
        .mockResolvedValueOnce(
          makeMember({
            inviteEmail: 'existing@example.com',
            inviteStatus: InviteStatus.ACCEPTED,
          }),
        ); // existing member check

      await expect(
        service.inviteMember('org-1', 'user-1', {
          email: 'existing@example.com',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a new pending invite for a new email', async () => {
      memberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: OrgRole.OWNER })) // actor
        .mockResolvedValueOnce(null); // no existing invite

      const newMember = makeMember({
        inviteEmail: 'new@example.com',
        inviteStatus: InviteStatus.PENDING,
        role: OrgRole.MEMBER,
      });
      memberRepo.create.mockReturnValue(newMember);
      memberRepo.save.mockResolvedValue(newMember);

      const result = await service.inviteMember('org-1', 'user-1', {
        email: 'new@example.com',
        role: OrgRole.MEMBER,
      });

      expect(memberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organisationId: 'org-1',
          inviteEmail: 'new@example.com',
          inviteStatus: InviteStatus.PENDING,
        }),
      );
      expect(result).toEqual(newMember);
    });

    it('re-invites an existing PENDING member', async () => {
      const existingMember = makeMember({
        inviteEmail: 'pending@example.com',
        inviteStatus: InviteStatus.PENDING,
      });
      memberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: OrgRole.OWNER })) // actor
        .mockResolvedValueOnce(existingMember); // existing invite

      memberRepo.save.mockResolvedValue(existingMember);

      await service.inviteMember('org-1', 'user-1', {
        email: 'pending@example.com',
      });

      expect(memberRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ inviteStatus: InviteStatus.PENDING }),
      );
      expect(memberRepo.create).not.toHaveBeenCalled();
    });
  });

  // ─── acceptInvite() ────────────────────────────────────────────────────────
  describe('acceptInvite()', () => {
    it('throws NotFoundException when token not found', async () => {
      memberRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.acceptInvite('bad-token', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when invite token is expired', async () => {
      const expiredInvite = makeMember({
        inviteToken: 'expired-token',
        inviteStatus: InviteStatus.PENDING,
        inviteTokenExpiresAt: new Date(Date.now() - 1000),
      });
      memberRepo.findOne.mockResolvedValueOnce(expiredInvite);

      await expect(
        service.acceptInvite('expired-token', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when user is already a member', async () => {
      const invite = makeMember({
        inviteToken: 'valid-token',
        inviteStatus: InviteStatus.PENDING,
        inviteTokenExpiresAt: new Date(Date.now() + 1000 * 60),
      });
      memberRepo.findOne
        .mockResolvedValueOnce(invite) // invite found
        .mockResolvedValueOnce(makeMember({ userId: 'user-2' })); // duplicate check

      await expect(
        service.acceptInvite('valid-token', 'user-2'),
      ).rejects.toThrow(ConflictException);
    });

    it('accepts a valid invite', async () => {
      const invite = makeMember({
        id: 'invite-member-1',
        inviteToken: 'valid-token',
        inviteStatus: InviteStatus.PENDING,
        inviteTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        userId: null,
      });
      memberRepo.findOne
        .mockResolvedValueOnce(invite) // invite found
        .mockResolvedValueOnce(null); // no duplicate

      memberRepo.save.mockImplementation(async (m) => m);

      const result = await service.acceptInvite('valid-token', 'user-2');

      expect(result.userId).toBe('user-2');
      expect(result.inviteStatus).toBe(InviteStatus.ACCEPTED);
      expect(result.inviteToken).toBeNull();
      expect(result.joinedAt).toBeInstanceOf(Date);
    });
  });

  // ─── updateMemberRole() ────────────────────────────────────────────────────
  describe('updateMemberRole()', () => {
    it('throws ForbiddenException when actor lacks required role', async () => {
      memberRepo.findOne.mockResolvedValue(
        makeMember({ role: OrgRole.MEMBER }),
      );

      await expect(
        service.updateMemberRole('org-1', 'user-1', 'member-2', {
          role: OrgRole.ADMIN,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when target member not found', async () => {
      memberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: OrgRole.OWNER })) // actor
        .mockResolvedValueOnce(null); // target

      await expect(
        service.updateMemberRole('org-1', 'user-1', 'member-99', {
          role: OrgRole.ADMIN,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when trying to change OWNER role', async () => {
      memberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: OrgRole.OWNER })) // actor
        .mockResolvedValueOnce(
          makeMember({ id: 'owner-member', role: OrgRole.OWNER }),
        ); // target

      await expect(
        service.updateMemberRole('org-1', 'user-1', 'owner-member', {
          role: OrgRole.ADMIN,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates member role successfully', async () => {
      const target = makeMember({ id: 'member-2', role: OrgRole.MEMBER });
      memberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: OrgRole.OWNER })) // actor
        .mockResolvedValueOnce(target); // target

      memberRepo.save.mockImplementation(async (m) => m);

      const result = await service.updateMemberRole(
        'org-1',
        'user-1',
        'member-2',
        { role: OrgRole.ADMIN },
      );

      expect(result.role).toBe(OrgRole.ADMIN);
    });
  });

  // ─── removeMember() ────────────────────────────────────────────────────────
  describe('removeMember()', () => {
    it('throws ForbiddenException when actor lacks required role', async () => {
      memberRepo.findOne.mockResolvedValue(
        makeMember({ role: OrgRole.MEMBER }),
      );

      await expect(
        service.removeMember('org-1', 'user-1', 'member-2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when target member not found', async () => {
      memberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: OrgRole.OWNER })) // actor
        .mockResolvedValueOnce(null); // target

      await expect(
        service.removeMember('org-1', 'user-1', 'member-99'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when trying to remove the OWNER', async () => {
      memberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: OrgRole.OWNER })) // actor
        .mockResolvedValueOnce(
          makeMember({ id: 'owner-m', role: OrgRole.OWNER }),
        ); // target

      await expect(
        service.removeMember('org-1', 'user-1', 'owner-m'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when ADMIN tries to remove another ADMIN', async () => {
      memberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: OrgRole.ADMIN })) // actor
        .mockResolvedValueOnce(
          makeMember({ id: 'admin-2', role: OrgRole.ADMIN }),
        ); // target

      await expect(
        service.removeMember('org-1', 'admin-1', 'admin-2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('removes a MEMBER successfully', async () => {
      const target = makeMember({ id: 'member-3', role: OrgRole.MEMBER });
      memberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: OrgRole.OWNER })) // actor
        .mockResolvedValueOnce(target); // target

      memberRepo.remove.mockResolvedValue(undefined);

      await expect(
        service.removeMember('org-1', 'user-1', 'member-3'),
      ).resolves.toBeUndefined();
      expect(memberRepo.remove).toHaveBeenCalledWith(target);
    });
  });
});
