import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import {
  Proposal,
  ProposalStatus,
  ProposalType,
  VoteWeightSource,
} from '../entities/proposal.entity';
import { Vote, VoteChoice } from '../entities/vote.entity';
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
  private readonly logger = new Logger(ProposalService.name);

  constructor(
    @InjectRepository(Proposal)
    private readonly proposalRepo: Repository<Proposal>,
    @InjectRepository(Vote)
    private readonly voteRepo: Repository<Vote>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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
      if (!createProposalDto.upgradeConfig?.auditReportUrl) {
        throw new BadRequestException(
          'auditReportUrl is required for CONTRACT_UPGRADE proposals',
        );
      }
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

    // CONTRACT_UPGRADE: only PLATINUM stakers can vote, weight = staked XLM
    if (proposal.proposalType === ProposalType.CONTRACT_UPGRADE) {
      const stakeTier = (voter as any).stakeTier;
      if (stakeTier !== 'PLATINUM') {
        throw new ForbiddenException(
          'Only PLATINUM stakers can vote on contract upgrade proposals',
        );
      }
    }

    // Get voter's XLM balance snapshot (from latest sync)
    const xlmBalance = voter.balances?.XLM || 0;

    if (!xlmBalance || xlmBalance === 0) {
      throw new BadRequestException('Voter has no XLM balance to vote');
    }

    const vote = this.voteRepo.create({
      proposalId,
      voterId,
      choice: castVoteDto.choice,
      weight: xlmBalance,
    });

    return this.voteRepo.save(vote);
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
          quorumReached: proposal.status === ProposalStatus.PASSED,
          passing: proposal.status === ProposalStatus.PASSED,
          totalVotes: proposal.votes?.length ?? 0,
        },
      };
    }

    // Live calculation for ACTIVE proposals
    const eligibleUsers = await this.countEligibleVoters();
    const results = this.calculateResults(proposal, eligibleUsers);

    return {
      proposal: this.serializeProposal(proposal),
      results,
    };
  }

  private async countEligibleVoters(): Promise<number> {
    return this.userRepo.count();
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
      (votes.length / totalEligibleVoters) * 100 >= proposal.quorumPercent;
    const passing = yesPercent >= proposal.passThresholdPercent;

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
}
