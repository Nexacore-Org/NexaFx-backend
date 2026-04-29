import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, Not } from 'typeorm';
import { Proposal, ProposalStatus } from '../entities/proposal.entity';
import { Vote, VoteChoice } from '../entities/vote.entity';
import { User, UserRole } from '../../users/user.entity';
import { CreateProposalDto } from '../dto/create-proposal.dto';
import { CastVoteDto } from '../dto/cast-vote.dto';
import { DaoService } from '../dao.service';

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

    const votingEndAt = new Date(createProposalDto.votingEndAt);
    const now = new Date();

    if (votingEndAt <= now) {
      throw new BadRequestException('votingEndAt must be in the future');
    }

    const proposal = this.proposalRepo.create({
      title: createProposalDto.title,
      description: createProposalDto.description,
      proposerId: userId,
      status: ProposalStatus.ACTIVE,
      votingStartAt: now,
      votingEndAt,
      quorumPercent: createProposalDto.quorumPercent,
      passThresholdPercent: createProposalDto.passThresholdPercent,
    });

    return this.proposalRepo.save(proposal);
  }

  async castVote(
    proposalId: string,
    voterId: string,
    voter: User,
    castVoteDto: CastVoteDto,
  ): Promise<Vote> {
    const proposal = await this.proposalRepo.findOne({ where: { id: proposalId } });
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
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

    // Get voter's XLM balance at votingStartAt (snapshot)
    // For now, use current balance from user.balances.XLM
    // In a real system, we would query historical balance data from outside API or our ledger
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

  async getProposalResults(proposalId: string) {
    const proposal = await this.proposalRepo.findOne({
      where: { id: proposalId },
      relations: ['votes'],
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Calculate vote totals
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

    // Calculate percentages
    const yesPercent = totalWeight > 0 ? (yesWeight / totalWeight) * 100 : 0;
    const noPercent = totalWeight > 0 ? (noWeight / totalWeight) * 100 : 0;
    const abstainPercent = totalWeight > 0 ? (abstainWeight / totalWeight) * 100 : 0;

    // Check if quorum is reached
    // Quorum is calculated as a percentage of total eligible voters, but since we don't track total eligibility,
    // we calculate based on total participation relative to a baseline
    // For simplicity, we'll check if enough votes were cast. In a prod system, we'd need total token holders count.
    const quorumReached = totalWeight > 0; // Placeholder: quorum reached if there are votes

    // Check if passing (majority)
    const passing = yesPercent > proposal.passThresholdPercent;

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
        yesPercent: parseFloat(yesPercent.toFixed(2)),
        noPercent: parseFloat(noPercent.toFixed(2)),
        abstainPercent: parseFloat(abstainPercent.toFixed(2)),
        totalWeight: parseFloat(totalWeight.toFixed(8)),
        yesWeight: parseFloat(yesWeight.toFixed(8)),
        noWeight: parseFloat(noWeight.toFixed(8)),
        abstainWeight: parseFloat(abstainWeight.toFixed(8)),
        quorumReached,
        passing,
        totalVotes: votes.length,
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
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async finalizeExpiredProposals(): Promise<void> {
    this.logger.log(
      'Starting finalization of expired ACTIVE proposals',
    );

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
    const votes = proposal.votes || [];

    // Calculate vote totals
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

    // Calculate percentages and quorum
    const yesPercent = totalWeight > 0 ? (yesWeight / totalWeight) * 100 : 0;
    const quorumReached = totalWeight > 0; // Quorum check logic

    // Determine proposal outcome
    let status = ProposalStatus.FAILED;
    if (quorumReached && yesPercent > proposal.passThresholdPercent) {
      status = ProposalStatus.PASSED;
    }

    // Update proposal with finalized counts
    proposal.status = status;
    proposal.finalYesWeight = yesWeight;
    proposal.finalNoWeight = noWeight;
    proposal.finalAbstainWeight = abstainWeight;
    proposal.totalVotingWeight = totalWeight;

    // If PASSED, submit to on-chain contract
    if (status === ProposalStatus.PASSED) {
      try {
        const result = await this.daoService.invokeContract(
          '', // Uses default contract from config
          'finalize_proposal',
          [proposal.id, yesWeight, noWeight, abstainWeight],
        );
        proposal.onChainTxHash = result.txHash;
        this.logger.log(
          `Proposal ${proposal.id} submitted on-chain: ${result.txHash}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to submit proposal ${proposal.id} on-chain:`,
          error instanceof Error ? error.message : String(error),
        );
        // Still mark as PASSED even if on-chain submission fails
        // The system can retry later
      }
    }

    await this.proposalRepo.save(proposal);
  }
}
