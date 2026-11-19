import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, LessThan, LessThanOrEqual, IsNull } from 'typeorm';
import {
  Proposal,
  ProposalStatus,
  ProposalType,
  VoteWeightSource,
} from '../entities/proposal.entity';
import { Vote, VoteChoice } from '../entities/vote.entity';
import { ProposalBalanceSnapshot } from '../entities/proposal-balance-snapshot.entity';
import { User, UserRole } from '../../users/user.entity';
import { CreateProposalDto } from '../dto/create-proposal.dto';
import { CastVoteDto } from '../dto/cast-vote.dto';
import { DaoService } from '../dao.service';

export interface VoteResults {
  yesWeight: number;
  noWeight: number;
  abstainWeight: number;
  totalWeight: number;
  yesPercent: number;
  noPercent: number;
  abstainPercent: number;
  quorumReached: boolean;
  passing: boolean;
  totalVotes: number;
  totalEligibleVoters: number;
}

@Injectable()
export class ProposalService {
  constructor(
    @InjectRepository(Proposal)
    private readonly proposalRepo: Repository<Proposal>,
    @InjectRepository(Vote)
    private readonly voteRepo: Repository<Vote>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ProposalBalanceSnapshot)
    private readonly snapshotRepo: Repository<ProposalBalanceSnapshot>,
    private readonly daoService: DaoService,
  ) {}

  async createProposal(
    userId: string,
    createProposalDto: CreateProposalDto,
  ): Promise<Proposal> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isContractUpgrade =
      createProposalDto.proposalType === ProposalType.CONTRACT_UPGRADE;

    if (isContractUpgrade) {
      if (user.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Only SUPER_ADMIN can create CONTRACT_UPGRADE proposals',
        );
      }
      throw new BadRequestException(
        'CONTRACT_UPGRADE proposals are unavailable until staking data is supported',
      );
    } else if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only ADMIN can create proposals');
    }

    const votingStartAt = new Date(createProposalDto.votingStartAt);
    const votingEndAt = new Date(createProposalDto.votingEndAt);
    const now = new Date();

    if (votingStartAt < now) {
      throw new BadRequestException(
        'votingStartAt must be now or in the future',
      );
    }
    if (votingEndAt <= votingStartAt) {
      throw new BadRequestException('votingEndAt must be after votingStartAt');
    }

    const passThreshold = isContractUpgrade
      ? 75
      : createProposalDto.passThresholdPercent;

    const proposal = this.proposalRepo.create({
      title: createProposalDto.title,
      description: createProposalDto.description,
      proposerId: userId,
      status: ProposalStatus.ACTIVE,
      votingStartAt,
      votingEndAt,
      quorumPercent: createProposalDto.quorumPercent,
      passThresholdPercent: passThreshold,
      stellarContractId: createProposalDto.stellarContractId ?? null,
      proposalType: createProposalDto.proposalType ?? ProposalType.STANDARD,
      upgradeConfig: isContractUpgrade
        ? (createProposalDto.upgradeConfig ?? null)
        : null,
      requiredStakeTier: isContractUpgrade ? 'PLATINUM' : null,
      voteWeightSource: isContractUpgrade
        ? VoteWeightSource.STAKING_BALANCE
        : null,
    });

    return this.proposalRepo.save(proposal);
  }

  async castVote(
    proposalId: string,
    voterId: string,
    castVoteDto: CastVoteDto,
  ): Promise<Vote> {
    const voter = await this.userRepo.findOne({ where: { id: voterId } });
    if (!voter) {
      throw new NotFoundException('User not found');
    }
    if (
      !voter.isActive ||
      !voter.isVerified ||
      voter.isSuspended ||
      voter.isDeleted ||
      voter.deletedAt
    ) {
      throw new ForbiddenException('Only eligible users can vote');
    }

    const proposal = await this.proposalRepo.findOne({
      where: { id: proposalId },
    });
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // CANCELLED proposals cannot receive votes → 422
    if (proposal.status === ProposalStatus.CANCELLED) {
      throw new UnprocessableEntityException(
        'Cannot vote on a cancelled proposal',
      );
    }

    if (proposal.status !== ProposalStatus.ACTIVE) {
      throw new BadRequestException('Proposal is not active');
    }

    const now = new Date();
    if (now < proposal.votingStartAt) {
      throw new BadRequestException('Voting period has not started');
    }
    if (now > proposal.votingEndAt) {
      throw new BadRequestException('Voting period has ended');
    }

    // Check for duplicate vote
    const existingVote = await this.voteRepo.findOne({
      where: { proposalId, voterId },
    });

    if (existingVote) {
      throw new ConflictException('Voter has already voted on this proposal');
    }

    if (proposal.proposalType === ProposalType.CONTRACT_UPGRADE) {
      throw new BadRequestException(
        'Voting on CONTRACT_UPGRADE proposals is unavailable until staking data is supported',
      );
    }

    const snapshot = await this.snapshotRepo.findOne({
      where: { proposalId, voterId },
    });
    if (!snapshot) {
      throw new BadRequestException(
        'Voting balance snapshot is not available for this voter',
      );
    }
    const xlmBalance = Number(snapshot.weight);

    if (!xlmBalance || xlmBalance === 0) {
      throw new BadRequestException('Voter has no XLM balance to vote');
    }

    const vote = this.voteRepo.create({
      proposalId,
      voterId,
      choice: castVoteDto.choice,
      weight: xlmBalance,
    });

    try {
      return await this.voteRepo.save(vote);
    } catch (error) {
      // Postgres unique-violation on (proposalId, voterId) → 409
      if (error?.code === '23505') {
        throw new ConflictException('Voter has already voted on this proposal');
      }
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async captureDueBalanceSnapshots(): Promise<number> {
    const proposals = await this.proposalRepo.find({
      where: {
        status: ProposalStatus.ACTIVE,
        votingStartAt: LessThanOrEqual(new Date()),
        balanceSnapshotsCaptured: false,
      },
    });

    let captured = 0;
    for (const proposal of proposals) {
      captured += await this.proposalRepo.manager.transaction(
        async (manager) => {
          const claim = await manager
            .createQueryBuilder()
            .update(Proposal)
            .set({ balanceSnapshotsCaptured: true })
            .where(
              '"id" = :id AND "status" = :status AND "balanceSnapshotsCaptured" = false',
              { id: proposal.id, status: ProposalStatus.ACTIVE },
            )
            .execute();
          if (!claim.affected) {
            return 0;
          }

          const userRepo = manager.getRepository(User);
          const snapshotRepo = manager.getRepository(ProposalBalanceSnapshot);
          const users = await userRepo.find({
            where: {
              isActive: true,
              isVerified: true,
              isSuspended: false,
              isDeleted: false,
              deletedAt: IsNull(),
              createdAt: LessThanOrEqual(proposal.votingStartAt),
            },
          });
          const snapshots = users.map((user) =>
            snapshotRepo.create({
              proposalId: proposal.id,
              voterId: user.id,
              weight: String(user.balances?.XLM ?? 0),
            }),
          );
          if (snapshots.length > 0) {
            await snapshotRepo.insert(snapshots);
          }
          return snapshots.length;
        },
      );
    }

    return captured;
  }

  async getProposalDetail(proposalId: string) {
    const proposal = await this.proposalRepo.findOne({
      where: { id: proposalId },
      relations: ['votes'],
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const eligibleUsers = await this.countEligibleVoters();
    const results = this.calculateResults(proposal, eligibleUsers);

    return {
      proposal: this.serializeProposal(proposal),
      currentVotes: results,
    };
  }

  async getProposalResults(proposalId: string) {
    const proposal = await this.proposalRepo.findOne({
      where: { id: proposalId },
      relations: ['votes'],
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Use finalized totals if available, otherwise compute live
    if (
      proposal.status === ProposalStatus.PASSED ||
      proposal.status === ProposalStatus.FAILED
    ) {
      const totalWeight = parseFloat(
        (proposal.totalVotingWeight ?? 0).toString(),
      );
      const yesWeight = parseFloat((proposal.finalYesWeight ?? 0).toString());
      const noWeight = parseFloat((proposal.finalNoWeight ?? 0).toString());
      const abstainWeight = parseFloat(
        (proposal.finalAbstainWeight ?? 0).toString(),
      );

      return {
        proposal: {
          id: proposal.id,
          title: proposal.title,
          status: proposal.status,
          votingStartAt: proposal.votingStartAt,
          votingEndAt: proposal.votingEndAt,
          quorumPercent: proposal.quorumPercent,
          passThresholdPercent: proposal.passThresholdPercent,
        },
        results: {
          yesPercent: parseFloat(
            (totalWeight > 0 ? (yesWeight / totalWeight) * 100 : 0).toFixed(2),
          ),
          noPercent: parseFloat(
            (totalWeight > 0 ? (noWeight / totalWeight) * 100 : 0).toFixed(2),
          ),
          abstainPercent: parseFloat(
            (totalWeight > 0 ? (abstainWeight / totalWeight) * 100 : 0).toFixed(
              2,
            ),
          ),
          totalWeight: parseFloat(totalWeight.toFixed(8)),
          yesWeight: parseFloat(yesWeight.toFixed(8)),
          noWeight: parseFloat(noWeight.toFixed(8)),
          abstainWeight: parseFloat(abstainWeight.toFixed(8)),
          quorumReached: proposal.quorumReached,
        },
      };
    }

    const eligibleUsers = await this.countEligibleVoters();
    const results = this.calculateResults(proposal, eligibleUsers);

    return {
      proposal: this.serializeProposal(proposal),
      results,
    };
  }

  private async countEligibleVoters(): Promise<number> {
    return this.userRepo.count({
      where: {
        isActive: true,
        isVerified: true,
        isSuspended: false,
        isDeleted: false,
        deletedAt: IsNull(),
      },
    });
  }

  private calculateResults(
    proposal: Proposal,
    totalEligibleVoters: number,
  ): VoteResults {
    const votes = proposal.votes ?? [];
    let yesWeight = 0;
    let noWeight = 0;
    let abstainWeight = 0;

    for (const vote of votes) {
      const weight = parseFloat((vote.weight ?? 0).toString());
      if (vote.choice === VoteChoice.YES) {
        yesWeight += weight;
      } else if (vote.choice === VoteChoice.NO) {
        noWeight += weight;
      } else if (vote.choice === VoteChoice.ABSTAIN) {
        abstainWeight += weight;
      }
    }

    const totalWeight = yesWeight + noWeight + abstainWeight;
    const yesPercent = totalWeight > 0 ? (yesWeight / totalWeight) * 100 : 0;
    const noPercent = totalWeight > 0 ? (noWeight / totalWeight) * 100 : 0;
    const abstainPercent =
      totalWeight > 0 ? (abstainWeight / totalWeight) * 100 : 0;

    const quorumReached =
      totalEligibleVoters > 0 &&
      votes.length / totalEligibleVoters >= proposal.quorumPercent / 100;

    const passing =
      quorumReached && yesPercent >= proposal.passThresholdPercent;

    return {
      yesWeight: parseFloat(yesWeight.toFixed(8)),
      noWeight: parseFloat(noWeight.toFixed(8)),
      abstainWeight: parseFloat(abstainWeight.toFixed(8)),
      totalWeight: parseFloat(totalWeight.toFixed(8)),
      yesPercent: parseFloat(yesPercent.toFixed(2)),
      noPercent: parseFloat(noPercent.toFixed(2)),
      abstainPercent: parseFloat(abstainPercent.toFixed(2)),
      quorumReached,
      passing,
      totalVotes: votes.length,
      totalEligibleVoters,
    };
  }

  private serializeProposal(proposal: Proposal) {
    return {
      id: proposal.id,
      title: proposal.title,
      description: proposal.description,
      proposerId: proposal.proposerId,
      status: proposal.status,
      votingStartAt: proposal.votingStartAt,
      votingEndAt: proposal.votingEndAt,
      quorumPercent: proposal.quorumPercent,
      passThresholdPercent: proposal.passThresholdPercent,
      stellarContractId: proposal.stellarContractId,
      proposalType: proposal.proposalType,
      upgradeConfig: proposal.upgradeConfig,
      requiredStakeTier: proposal.requiredStakeTier,
      voteWeightSource: proposal.voteWeightSource,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    };
  }

  async finalizeExpiredProposals(): Promise<number> {
    const now = new Date();
    const expired = await this.proposalRepo.find({
      where: {
        status: ProposalStatus.ACTIVE,
        votingEndAt: LessThan(now),
      },
      relations: ['votes'],
    });

    let finalized = 0;
    for (const proposal of expired) {
      const eligibleUsers = await this.countEligibleVoters();
      const results = this.calculateResults(proposal, eligibleUsers);

      proposal.totalVotingWeight = results.totalWeight;
      proposal.finalYesWeight = results.yesWeight;
      proposal.finalNoWeight = results.noWeight;
      proposal.finalAbstainWeight = results.abstainWeight;
      proposal.quorumReached = results.quorumReached;
      proposal.status = results.passing
        ? ProposalStatus.PASSED
        : ProposalStatus.FAILED;

      await this.proposalRepo.save(proposal);
      finalized += 1;
    }

    return finalized;
  }

  async listProposals(
    page = 1,
    limit = 10,
    status?: ProposalStatus,
  ): Promise<{
    data: Proposal[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const maxPage = 1_000_000;
    const maxLimit = 100;
    if (!Number.isInteger(page) || page < 1 || page > maxPage) {
      throw new BadRequestException(`page must be between 1 and ${maxPage}`);
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
      throw new BadRequestException(`limit must be between 1 and ${maxLimit}`);
    }
    if (status && !Object.values(ProposalStatus).includes(status)) {
      throw new BadRequestException('Invalid proposal status');
    }

    const [data, total] = await this.proposalRepo.findAndCount({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async cancelProposal(proposalId: string, adminId: string): Promise<Proposal> {
    const admin = await this.userRepo.findOne({ where: { id: adminId } });
    if (
      !admin ||
      (admin.role !== UserRole.ADMIN && admin.role !== UserRole.SUPER_ADMIN)
    ) {
      throw new ForbiddenException('Only an admin can cancel proposals');
    }

    const proposal = await this.proposalRepo.findOne({
      where: { id: proposalId },
    });
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }
    if (
      proposal.status !== ProposalStatus.ACTIVE ||
      proposal.votingEndAt <= new Date()
    ) {
      throw new ConflictException(
        'Only ACTIVE proposals before votingEndAt can be cancelled',
      );
    }

    proposal.status = ProposalStatus.CANCELLED;
    return this.proposalRepo.save(proposal);
  }
}
