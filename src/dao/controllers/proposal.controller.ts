import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { ProposalService } from '../services/proposal.service';
import { CreateProposalDto } from '../dto/create-proposal.dto';
import { CastVoteDto } from '../dto/cast-vote.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import { ProposalStatus } from '../entities/proposal.entity';

@ApiTags('DAO - Governance')
@Controller('dao/proposals')
@ApiBearerAuth('access-token')
export class ProposalController {
  constructor(private readonly proposalService: ProposalService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a new governance proposal (ADMIN only)',
    description: 'Voting opens immediately upon creation',
  })
  @ApiResponse({
    status: 201,
    description: 'Proposal created',
    schema: {
      example: {
        id: 'uuid',
        title: 'Increase BTC pair liquidity',
        proposerId: 'uuid',
        status: 'ACTIVE',
        votingStartAt: '2026-04-28T10:00:00Z',
        votingEndAt: '2026-05-05T10:00:00Z',
        quorumPercent: 50,
        passThresholdPercent: 66,
        createdAt: '2026-04-28T10:00:00Z',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Only ADMIN can create proposals' })
  @ApiResponse({ status: 400, description: 'votingEndAt must be in the future' })
  async createProposal(
    @Request() req: { user: { userId: string; user: any } },
    @Body() createProposalDto: CreateProposalDto,
  ) {
    return this.proposalService.createProposal(
      req.user.userId,
      req.user.user,
      createProposalDto,
    );
  }

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  @ApiOperation({
    summary: 'Cast a vote on a proposal',
    description:
      'Weight is based on voter XLM balance at votingStartAt. Duplicate votes return 409.',
  })
  @ApiResponse({
    status: 201,
    description: 'Vote cast',
    schema: {
      example: {
        id: 'uuid',
        proposalId: 'uuid',
        voterId: 'uuid',
        choice: 'YES',
        weight: 1000.5,
        castAt: '2026-04-28T12:00:00Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  @ApiResponse({ status: 400, description: 'Proposal not active or voting ended' })
  @ApiResponse({ status: 409, description: 'Voter has already voted on this proposal' })
  async castVote(
    @Param('id') proposalId: string,
    @Request() req: { user: { userId: string; user: any } },
    @Body() castVoteDto: CastVoteDto,
  ) {
    return this.proposalService.castVote(
      proposalId,
      req.user.userId,
      req.user.user,
      castVoteDto,
    );
  }

  @Get(':id/results')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get voting results for a proposal',
  })
  @ApiResponse({
    status: 200,
    description: 'Proposal results',
    schema: {
      example: {
        proposal: {
          id: 'uuid',
          title: 'Increase BTC pair liquidity',
          status: 'PASSED',
          votingStartAt: '2026-04-28T10:00:00Z',
          votingEndAt: '2026-05-05T10:00:00Z',
          quorumPercent: 50,
          passThresholdPercent: 66,
        },
        results: {
          yesPercent: 75.5,
          noPercent: 20.3,
          abstainPercent: 4.2,
          totalWeight: 10000.25,
          yesWeight: 7550.1875,
          noWeight: 2030.075,
          abstainWeight: 420.0875,
          quorumReached: true,
          passing: true,
          totalVotes: 15,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  async getResults(@Param('id') proposalId: string) {
    return this.proposalService.getProposalResults(proposalId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List all proposals with pagination',
  })
  @ApiQuery({
    name: 'page',
    type: Number,
    required: false,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    required: false,
    example: 10,
  })
  @ApiQuery({
    name: 'status',
    type: String,
    required: false,
    enum: ProposalStatus,
    description: 'Filter by proposal status',
  })
  @ApiResponse({
    status: 200,
    description: 'List of proposals',
    schema: {
      example: {
        data: [
          {
            id: 'uuid',
            title: 'Increase BTC pair liquidity',
            status: 'ACTIVE',
            votingStartAt: '2026-04-28T10:00:00Z',
            votingEndAt: '2026-05-05T10:00:00Z',
            quorumPercent: 50,
            passThresholdPercent: 66,
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 5,
          pages: 1,
        },
      },
    },
  })
  async listProposals(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: ProposalStatus,
  ) {
    return this.proposalService.listProposals(page, limit, status);
  }
}
