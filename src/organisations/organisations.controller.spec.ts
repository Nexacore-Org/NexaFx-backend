import { Test, TestingModule } from '@nestjs/testing';
import { OrganisationsController } from './organisations.controller';
import { OrganisationsService } from './organisations.service';
import { Organisation } from './entities/organisation.entity';
import {
  OrganisationMember,
  OrgRole,
  InviteStatus,
} from './entities/organisation-member.entity';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';

const mockOrganisationsService = () => ({
  createOrganisation: jest.fn(),
  getUserOrganisations: jest.fn(),
  getOrganisationById: jest.fn(),
  listMembers: jest.fn(),
  inviteMember: jest.fn(),
  acceptInvite: jest.fn(),
  updateMemberRole: jest.fn(),
  removeMember: jest.fn(),
});

const makeUser = (): CurrentUserPayload => ({
  userId: 'user-1',
  email: 'user@example.com',
  role: 'USER',
});

const makeOrg = (): Organisation =>
  ({
    id: 'org-1',
    name: 'Test Org',
    description: null,
    walletPublicKey: 'GPUBKEY',
    walletSecretKeyEncrypted: 'enc',
    balances: {},
    txLimitPerDay: 10000,
    txLimitPerTx: 1000,
    ownerId: 'user-1',
    members: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Organisation;

const makeMember = (): OrganisationMember =>
  ({
    id: 'member-1',
    organisationId: 'org-1',
    userId: 'user-1',
    inviteEmail: 'user@example.com',
    role: OrgRole.OWNER,
    inviteStatus: InviteStatus.ACCEPTED,
    inviteToken: null,
    inviteTokenExpiresAt: null,
    joinedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as OrganisationMember;

describe('OrganisationsController', () => {
  let controller: OrganisationsController;
  let orgsService: ReturnType<typeof mockOrganisationsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganisationsController],
      providers: [
        {
          provide: OrganisationsService,
          useFactory: mockOrganisationsService,
        },
      ],
    }).compile();

    controller = module.get<OrganisationsController>(OrganisationsController);
    orgsService = module.get(OrganisationsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create()', () => {
    it('delegates to orgsService.createOrganisation()', async () => {
      const org = makeOrg();
      orgsService.createOrganisation.mockResolvedValue(org);
      const user = makeUser();

      const result = await controller.create(user, { name: 'Test Org' });

      expect(orgsService.createOrganisation).toHaveBeenCalledWith('user-1', {
        name: 'Test Org',
      });
      expect(result).toEqual(org);
    });
  });

  describe('listMine()', () => {
    it('returns orgs for current user', async () => {
      const orgs = [makeOrg()];
      orgsService.getUserOrganisations.mockResolvedValue(orgs);

      const result = await controller.listMine(makeUser());

      expect(orgsService.getUserOrganisations).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(orgs);
    });
  });

  describe('get()', () => {
    it('delegates to orgsService.getOrganisationById()', async () => {
      const org = makeOrg();
      orgsService.getOrganisationById.mockResolvedValue(org);

      const result = await controller.get('org-1', makeUser());

      expect(orgsService.getOrganisationById).toHaveBeenCalledWith(
        'org-1',
        'user-1',
      );
      expect(result).toEqual(org);
    });
  });

  describe('listMembers()', () => {
    it('delegates to orgsService.listMembers()', async () => {
      const members = [makeMember()];
      orgsService.listMembers.mockResolvedValue(members);

      const result = await controller.listMembers('org-1', makeUser());

      expect(orgsService.listMembers).toHaveBeenCalledWith('org-1', 'user-1');
      expect(result).toEqual(members);
    });
  });

  describe('invite()', () => {
    it('delegates to orgsService.inviteMember()', async () => {
      const member = makeMember();
      orgsService.inviteMember.mockResolvedValue(member);
      const dto = { email: 'new@example.com', role: OrgRole.MEMBER };

      const result = await controller.invite('org-1', makeUser(), dto);

      expect(orgsService.inviteMember).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        dto,
      );
      expect(result).toEqual(member);
    });
  });

  describe('acceptInvite()', () => {
    it('delegates to orgsService.acceptInvite() with token', async () => {
      const member = makeMember();
      orgsService.acceptInvite.mockResolvedValue(member);
      const dto = { token: 'some-uuid-token' };

      const result = await controller.acceptInvite('org-1', makeUser(), dto);

      expect(orgsService.acceptInvite).toHaveBeenCalledWith(
        'some-uuid-token',
        'user-1',
      );
      expect(result).toEqual(member);
    });
  });

  describe('updateRole()', () => {
    it('delegates to orgsService.updateMemberRole()', async () => {
      const member = makeMember();
      orgsService.updateMemberRole.mockResolvedValue(member);
      const dto = { role: OrgRole.ADMIN };

      const result = await controller.updateRole(
        'org-1',
        'member-1',
        makeUser(),
        dto,
      );

      expect(orgsService.updateMemberRole).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        'member-1',
        dto,
      );
      expect(result).toEqual(member);
    });
  });

  describe('removeMember()', () => {
    it('delegates to orgsService.removeMember()', async () => {
      orgsService.removeMember.mockResolvedValue(undefined);

      await controller.removeMember('org-1', 'member-2', makeUser());

      expect(orgsService.removeMember).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        'member-2',
      );
    });
  });
});
