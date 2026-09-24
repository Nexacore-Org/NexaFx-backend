import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Organisation } from './entities/organisation.entity';
import {
  OrganisationMember,
  OrgRole,
  InviteStatus,
} from './entities/organisation-member.entity';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { encryptWithAes256Gcm } from '../common/utils/encryption.util';
import { CreateOrganisationDto } from './dto/create-organisation.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UsersService } from '../users/users.service';

const INVITE_EXPIRY_HOURS = 7 * 24;

@Injectable()
export class OrganisationsService {
  private readonly logger = new Logger(OrganisationsService.name);

  constructor(
    @InjectRepository(Organisation)
    private readonly orgRepo: Repository<Organisation>,
    @InjectRepository(OrganisationMember)
    private readonly memberRepo: Repository<OrganisationMember>,
    private readonly stellarService: StellarService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async createOrganisation(
    ownerId: string,
    dto: CreateOrganisationDto,
  ): Promise<Organisation> {
    const existing = await this.orgRepo.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(
        `Organisation with name "${dto.name}" already exists`,
      );
    }

    const { publicKey, secretKey } = await this.stellarService.generateWallet(ownerId);
    const encKey = this.configService.get<string>('WALLET_ENCRYPTION_KEY') ?? '';
    const encrypted = encryptWithAes256Gcm(secretKey, encKey);

    const org = this.orgRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      walletPublicKey: publicKey,
      walletSecretKeyEncrypted: encrypted,
      ownerId,
      balances: {},
      txLimitPerDay: dto.txLimitPerDay ?? 10000,
      txLimitPerTx: dto.txLimitPerTx ?? 1000,
    });

    await this.orgRepo.save(org);

    const ownerMember = this.memberRepo.create({
      organisationId: org.id,
      userId: ownerId,
      inviteEmail: '',
      role: OrgRole.OWNER,
      inviteStatus: InviteStatus.ACCEPTED,
      joinedAt: new Date(),
    });
    await this.memberRepo.save(ownerMember);

    this.logger.log(`Organisation "${org.name}" created by user ${ownerId}`);

    return this.getOrganisationById(org.id, ownerId);
  }

  async getUserOrganisations(userId: string): Promise<Organisation[]> {
    const memberships = await this.memberRepo.find({
      where: { userId, inviteStatus: InviteStatus.ACCEPTED },
      relations: ['organisation'],
    });
    return memberships.map((m) => m.organisation);
  }

  async getOrganisationById(
    orgId: string,
    userId: string,
  ): Promise<Organisation> {
    await this.requireMembership(orgId, userId);

    const org = await this.orgRepo.findOne({
      where: { id: orgId },
      relations: ['owner', 'members', 'members.user'],
    });

    if (!org) throw new NotFoundException(`Organisation ${orgId} not found`);
    return org;
  }

  async listMembers(orgId: string, userId: string): Promise<OrganisationMember[]> {
    await this.requireMembership(orgId, userId);

    return this.memberRepo.find({
      where: { organisationId: orgId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async inviteMember(
    orgId: string,
    actorId: string,
    dto: InviteMemberDto,
  ): Promise<OrganisationMember> {
    const actor = await this.requireRole(orgId, actorId, [OrgRole.OWNER, OrgRole.ADMIN]);

    if (actor.role === OrgRole.ADMIN && dto.role === OrgRole.OWNER) {
      throw new ForbiddenException('Only the OWNER can assign the OWNER role');
    }

    const existing = await this.memberRepo.findOne({
      where: { organisationId: orgId, inviteEmail: dto.email.toLowerCase() },
    });

    if (existing && existing.inviteStatus === InviteStatus.ACCEPTED) {
      throw new ConflictException(`${dto.email} is already a member`);
    }

    const expiresAt = new Date(
      Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    const invitedUser = await this.usersService.findByEmail(dto.email);

    if (existing) {
      existing.inviteToken = randomUUID();
      existing.inviteTokenExpiresAt = expiresAt;
      existing.inviteStatus = InviteStatus.PENDING;
      existing.role = dto.role ?? OrgRole.MEMBER;
      existing.userId = invitedUser?.id ?? null;
      await this.memberRepo.save(existing);
      return existing;
    }

    const member = this.memberRepo.create({
      organisationId: orgId,
      userId: invitedUser?.id ?? null,
      inviteEmail: dto.email.toLowerCase(),
      role: dto.role ?? OrgRole.MEMBER,
      inviteStatus: InviteStatus.PENDING,
      inviteToken: randomUUID(),
      inviteTokenExpiresAt: expiresAt,
    });

    await this.memberRepo.save(member);
    this.logger.log(`Invite sent to ${dto.email} for org ${orgId}`);
    return member;
  }

  async acceptInvite(token: string, userId: string): Promise<OrganisationMember> {
    const member = await this.memberRepo.findOne({
      where: { inviteToken: token, inviteStatus: InviteStatus.PENDING },
    });

    if (!member) {
      throw new NotFoundException('Invite not found or already used');
    }

    if (member.inviteTokenExpiresAt && member.inviteTokenExpiresAt < new Date()) {
      throw new BadRequestException('Invite token has expired');
    }

    const duplicate = await this.memberRepo.findOne({
      where: {
        organisationId: member.organisationId,
        userId,
        inviteStatus: InviteStatus.ACCEPTED,
      },
    });

    if (duplicate) {
      throw new ConflictException('You are already a member of this organisation');
    }

    member.userId = userId;
    member.inviteStatus = InviteStatus.ACCEPTED;
    member.inviteToken = null;
    member.inviteTokenExpiresAt = null;
    member.joinedAt = new Date();

    await this.memberRepo.save(member);
    this.logger.log(`User ${userId} accepted invite for org ${member.organisationId}`);
    return member;
  }

  async updateMemberRole(
    orgId: string,
    actorId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<OrganisationMember> {
    await this.requireRole(orgId, actorId, [OrgRole.OWNER, OrgRole.ADMIN]);

    const target = await this.memberRepo.findOne({
      where: { id: memberId, organisationId: orgId },
    });

    if (!target) throw new NotFoundException(`Member ${memberId} not found`);

    if (target.role === OrgRole.OWNER) {
      throw new ForbiddenException('Cannot change the OWNER role');
    }

    target.role = dto.role;
    await this.memberRepo.save(target);
    return target;
  }

  async removeMember(
    orgId: string,
    actorId: string,
    memberId: string,
  ): Promise<void> {
    const actor = await this.requireRole(orgId, actorId, [OrgRole.OWNER, OrgRole.ADMIN]);

    const target = await this.memberRepo.findOne({
      where: { id: memberId, organisationId: orgId },
    });

    if (!target) throw new NotFoundException(`Member ${memberId} not found`);

    if (target.role === OrgRole.OWNER) {
      throw new ForbiddenException('Cannot remove the OWNER');
    }

    if (actor.role === OrgRole.ADMIN && target.role === OrgRole.ADMIN) {
      throw new ForbiddenException('Admins cannot remove other admins');
    }

    await this.memberRepo.remove(target);
    this.logger.log(`Member ${memberId} removed from org ${orgId} by ${actorId}`);
  }

  private async requireMembership(
    orgId: string,
    userId: string,
  ): Promise<OrganisationMember> {
    const member = await this.memberRepo.findOne({
      where: { organisationId: orgId, userId, inviteStatus: InviteStatus.ACCEPTED },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this organisation');
    }

    return member;
  }

  private async requireRole(
    orgId: string,
    userId: string,
    roles: OrgRole[],
  ): Promise<OrganisationMember> {
    const member = await this.requireMembership(orgId, userId);

    if (!roles.includes(member.role)) {
      throw new ForbiddenException(
        `This action requires one of these roles: ${roles.join(', ')}`,
      );
    }

    return member;
  }
}
