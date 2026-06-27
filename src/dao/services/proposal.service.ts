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
import { Proposal, ProposalStatus } from '../entities/proposal.entity';
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
    user: User,
    createProposalDto: CreateProposalDto,
  ): Promise<Proposal> {
    // Only ADMIN can create proposals
    if (user.role !== UserRole.ADMIN) {
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

    const proposal = this.proposalRepo.create({
      title: createProposalDto.title,
      description: createProposalDto.description,
      proposerId: userId,
      status: ProposalStatus.ACTIVE,
      votingStartAt,
      votingEndAt,
      quorumPercent: createProposalDto.quorumPercent,
      passThresholdPercent: createProposalDto.passThresholdPercent,
      stellarContractId: createProposalDto.stellarContractId ?? null,
    });

    return this.proposalRepo.save(proposal);
  }

  async castVote(
    proposalId: string,
    voterId: string,
    voter: User,
    castVoteDto: CastVoteDto,
  ): Promise<Vote> {
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
        yesPercent: results.yesPercent,
        noPercent: results.noPercent,
        abstainPercent: results.abstainPercent,
        totalWeight: results.totalWeight,
        yesWeight: results.yesWeight,
        noWeight: results.noWeight,
        abstainWeight: results.abstainWeight,
        quorumReached: results.quorumReached,
        passing: results.passing,
        totalVotes: results.totalVotes,
      },
    };
  }

  async listProposals(
    page: number = 1,
    limit: number = 10,
    status?: ProposalStatus,
  ) {
    const where = status ? { status } : {};
    const [data, total] = await this.proposalRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: data.map((p) => this.serializeProposal(p)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async cancelProposal(proposalId: string): Promise<Proposal> {
    const proposal = await this.proposalRepo.findOne({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.status !== ProposalStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE proposals can be cancelled');
    }

    proposal.status = ProposalStatus.CANCELLED;
    return this.proposalRepo.save(proposal);
  }

  async finalizeExpiredProposals(): Promise<void> {
    this.logger.log('Starting finalization of expired ACTIVE proposals');

    const now = new Date();

    // Find all ACTIVE proposals that have passed their votingEndAt
    const expiredProposals = await this.proposalRepo.find({
      where: {
        status: ProposalStatus.ACTIVE,
        votingEndAt: LessThan(now),
      },
      relations: ['votes'],
    });

    for (const proposal of expiredProposals) {
      try {
        await this.finalizeProposal(proposal);
      } catch (error) {
        this.logger.error(
          `Failed to finalize proposal ${proposal.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    this.logger.log(
      `Finalization complete. Processed ${expiredProposals.length} proposals.`,
    );
  }

  private async finalizeProposal(proposal: Proposal): Promise<void> {
    const eligibleUsers = await this.countEligibleVoters();
    const results = this.calculateResults(proposal, eligibleUsers);

    // Update proposal with finalized counts
    proposal.status = results.passing
      ? ProposalStatus.PASSED
      : ProposalStatus.FAILED;
    proposal.finalYesWeight = results.yesWeight;
    proposal.finalNoWeight = results.noWeight;
    proposal.finalAbstainWeight = results.abstainWeight;
    proposal.totalVotingWeight = results.totalWeight;

    // If PASSED and has stellarContractId, invoke on-chain contract
    if (results.passing && proposal.stellarContractId) {
      try {
        const result = await this.daoService.invokeContract(
          proposal.stellarContractId,
          'finalize_proposal',
          [
            proposal.id,
            results.yesWeight,
            results.noWeight,
            results.abstainWeight,
          ],
        );
        proposal.onChainTxHash = result.txHash;
        this.logger.log(
          `Proposal ${proposal.id} submitted on-chain via ${proposal.stellarContractId}: ${result.txHash}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to submit proposal ${proposal.id} on-chain:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    await this.proposalRepo.save(proposal);
  }

  /**
   * Count eligible voters: users with XLM balance > 0
   */
  private async countEligibleVoters(): Promise<User[]> {
    const users = await this.userRepo.find({
      select: ['id', 'balances'],
    });

    return users.filter((u) => {
      const xlmBalance = u.balances?.XLM;
      return typeof xlmBalance === 'number' && xlmBalance > 0;
    });
  }

  private calculateResults(
    proposal: Proposal,
    eligibleUsers: User[],
  ): VoteResults {
    const votes = proposal.votes || [];

    const yesWeight = votes
      .filter((v) => v.choice === VoteChoice.YES)
      .reduce((sum, v) => sum + parseFloat(v.weight.toString()), 0);

    const noWeight = votes
      .filter((v) => v.choice === VoteChoice.NO)
      .reduce((sum, v) => sum + parseFloat(v.weight.toString()), 0);

    const abstainWeight = votes
      .filter((v) => v.choice === VoteChoice.ABSTAIN)
      .reduce((sum, v) => sum + parseFloat(v.weight.toString()), 0);

    const totalWeight = yesWeight + noWeight + abstainWeight;

    const yesPercent =
      totalWeight > 0
        ? parseFloat(((yesWeight / totalWeight) * 100).toFixed(2))
        : 0;
    const noPercent =
      totalWeight > 0
        ? parseFloat(((noWeight / totalWeight) * 100).toFixed(2))
        : 0;
    const abstainPercent =
      totalWeight > 0
        ? parseFloat(((abstainWeight / totalWeight) * 100).toFixed(2))
        : 0;

    // Quorum: (unique voters who cast a ballot / total eligible voters) >= quorumPercent
    const uniqueVoters = new Set(votes.map((v) => v.voterId)).size;
    const totalEligible = eligibleUsers.length;
    const quorumReached =
      totalEligible > 0
        ? (uniqueVoters / totalEligible) * 100 >= proposal.quorumPercent
        : totalWeight > 0;

    // Passing: quorum met AND yesPercent > passThresholdPercent
    const passing = quorumReached && yesPercent > proposal.passThresholdPercent;

    return {
      yesWeight: parseFloat(yesWeight.toFixed(8)),
      noWeight: parseFloat(noWeight.toFixed(8)),
      abstainWeight: parseFloat(abstainWeight.toFixed(8)),
      totalWeight: parseFloat(totalWeight.toFixed(8)),
      yesPercent,
      noPercent,
      abstainPercent,
      quorumReached,
      passing,
      totalVotes: votes.length,
      totalEligibleVoters: totalEligible,
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
      onChainTxHash: proposal.onChainTxHash,
      finalYesWeight: proposal.finalYesWeight,
      finalNoWeight: proposal.finalNoWeight,
      finalAbstainWeight: proposal.finalAbstainWeight,
      totalVotingWeight: proposal.totalVotingWeight,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    };
  }
}
