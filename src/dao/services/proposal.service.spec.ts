import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DaoService } from '../dao.service';
import { CastVoteDto } from '../dto/cast-vote.dto';
import {
  Proposal,
  ProposalStatus,
  ProposalType,
} from '../entities/proposal.entity';
import { ProposalBalanceSnapshot } from '../entities/proposal-balance-snapshot.entity';
import { Vote, VoteChoice } from '../entities/vote.entity';
import { User, UserRole } from '../../users/user.entity';
import { CreateProposalDto } from '../dto/create-proposal.dto';
import { ProposalService } from './proposal.service';

describe('ProposalService', () => {
  let service: ProposalService;
  let proposalRepo: jest.Mocked<
    Pick<
      Repository<Proposal>,
      'findAndCount' | 'find' | 'findOne' | 'create' | 'save'
    >
  >;
  let voteRepo: jest.Mocked<
    Pick<Repository<Vote>, 'findOne' | 'create' | 'save'>
  >;
  let userRepo: jest.Mocked<
    Pick<Repository<User>, 'findOne' | 'find' | 'count'>
  >;
  let snapshotRepo: jest.Mocked<
    Pick<Repository<ProposalBalanceSnapshot>, 'findOne' | 'create' | 'insert'>
  >;

  beforeEach(() => {
    proposalRepo = {
      findAndCount: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    voteRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    userRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
    };
    snapshotRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      insert: jest.fn(),
    };
    service = new ProposalService(
      proposalRepo as unknown as Repository<Proposal>,
      voteRepo as unknown as Repository<Vote>,
      userRepo as unknown as Repository<User>,
      snapshotRepo as unknown as Repository<ProposalBalanceSnapshot>,
      {} as unknown as DaoService,
    );
  });

  it('lists proposals with bounded pagination and status filtering', async () => {
    const proposals = [{ id: 'proposal-1' }] as Proposal[];
    proposalRepo.findAndCount.mockResolvedValue([proposals, 11]);

    await expect(
      service.listProposals(2, 5, ProposalStatus.ACTIVE),
    ).resolves.toEqual({
      data: proposals,
      pagination: { page: 2, limit: 5, total: 11, pages: 3 },
    });
    expect(proposalRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: ProposalStatus.ACTIVE },
        skip: 5,
        take: 5,
      }),
    );
    await expect(service.listProposals(1, 101)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('cancels an active proposal before its voting end', async () => {
    const proposal = {
      id: 'proposal-1',
      status: ProposalStatus.ACTIVE,
      votingEndAt: new Date(Date.now() + 60_000),
    } as Proposal;
    userRepo.findOne.mockResolvedValue({ role: UserRole.ADMIN } as User);
    proposalRepo.findOne.mockResolvedValue(proposal);
    proposalRepo.save.mockImplementation(async (value) => value);

    await expect(service.cancelProposal(proposal.id, 'admin-1')).resolves.toMatchObject({
      status: ProposalStatus.CANCELLED,
    });
  });

  it('does not cancel a proposal after voting ends', async () => {
    userRepo.findOne.mockResolvedValue({ role: UserRole.ADMIN } as User);
    proposalRepo.findOne.mockResolvedValue({
      id: 'proposal-1',
      status: ProposalStatus.ACTIVE,
      votingEndAt: new Date(Date.now() - 1),
    } as Proposal);

    await expect(
      service.cancelProposal('proposal-1', 'admin-1'),
    ).rejects.toThrow('Only ACTIVE proposals before votingEndAt can be cancelled');
  });

  it('uses the captured opening balance even if the live balance later changes', async () => {
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
      getRepository: jest.fn((entity) =>
        entity === User ? userRepo : snapshotRepo,
      ),
    };
    const runTransaction = async (
      callback: (transactionManager: typeof manager) => Promise<number>,
    ) => callback(manager);
    const transaction = jest.fn(runTransaction);
    Object.defineProperty(proposalRepo, 'manager', {
      value: { transaction },
    });
    const user = {
      id: 'voter-1',
      balances: { XLM: 42 },
      isActive: true,
      isVerified: true,
      isSuspended: false,
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date(Date.now() - 60_000),
    } as User;
    const proposal = {
      id: 'proposal-1',
      status: ProposalStatus.ACTIVE,
      proposalType: ProposalType.STANDARD,
      votingStartAt: new Date(Date.now() - 30_000),
      votingEndAt: new Date(Date.now() + 60_000),
    } as Proposal;
    proposalRepo.find.mockResolvedValue([proposal]);
    snapshotRepo.create.mockImplementation(
      (value) => value as ProposalBalanceSnapshot,
    );
    snapshotRepo.insert.mockResolvedValue({
      identifiers: [],
      generatedMaps: [],
      raw: [],
    });
    userRepo.find.mockResolvedValue([user]);

    await expect(service.captureDueBalanceSnapshots()).resolves.toBe(1);
    expect(snapshotRepo.insert).toHaveBeenCalledWith([
      expect.objectContaining({ weight: '42' }),
    ]);

    user.balances.XLM = 1;
    userRepo.findOne.mockResolvedValue(user);
    proposalRepo.findOne.mockResolvedValue(proposal);
    voteRepo.findOne.mockResolvedValue(null);
    snapshotRepo.findOne.mockResolvedValue({
      proposalId: proposal.id,
      voterId: user.id,
      weight: '42',
    } as ProposalBalanceSnapshot);
    voteRepo.create.mockImplementation((value) => value as Vote);
    voteRepo.save.mockImplementation(async (value) => value);

    const dto: CastVoteDto = { choice: VoteChoice.YES };
    await expect(
      service.castVote(proposal.id, user.id, dto),
    ).resolves.toMatchObject({ weight: 42 });
  });

  it('rejects a vote when no opening snapshot exists despite a live balance', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'voter-1',
      balances: { XLM: 100 },
      isActive: true,
      isVerified: true,
      isSuspended: false,
      isDeleted: false,
      deletedAt: null,
    } as User);
    proposalRepo.findOne.mockResolvedValue({
      id: 'proposal-1',
      status: ProposalStatus.ACTIVE,
      proposalType: ProposalType.STANDARD,
      votingStartAt: new Date(Date.now() - 30_000),
      votingEndAt: new Date(Date.now() + 60_000),
    } as Proposal);
    voteRepo.findOne.mockResolvedValue(null);
    snapshotRepo.findOne.mockResolvedValue(null);

    await expect(
      service.castVote('proposal-1', 'voter-1', {
        choice: VoteChoice.YES,
      }),
    ).rejects.toThrow('Voting balance snapshot is not available');
  });

  it('persists quorum when an expired proposal fails', async () => {
    const proposal = {
      id: 'proposal-1',
      status: ProposalStatus.ACTIVE,
      votingEndAt: new Date(Date.now() - 1),
      quorumPercent: 100,
      passThresholdPercent: 50,
      votes: [{ choice: VoteChoice.NO, weight: 1 }],
    } as Proposal;
    proposalRepo.find.mockResolvedValue([proposal]);
    proposalRepo.save.mockImplementation(async (value) => value);
    userRepo.count.mockResolvedValue(1);

    await expect(service.finalizeExpiredProposals()).resolves.toBe(1);
    expect(proposalRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ProposalStatus.FAILED,
        quorumReached: true,
      }),
    );

    proposalRepo.findOne.mockResolvedValue(proposal);
    await expect(
      service.getProposalResults(proposal.id),
    ).resolves.toMatchObject({ results: { quorumReached: true } });
  });

  it('rejects contract-upgrade proposals until a staking source exists', async () => {
    userRepo.findOne.mockResolvedValue({ role: UserRole.SUPER_ADMIN } as User);

    const dto: CreateProposalDto = {
      title: 'Upgrade contract',
      description: 'Apply the audited upgrade.',
      votingStartAt: new Date(Date.now() + 60_000).toISOString(),
      votingEndAt: new Date(Date.now() + 120_000).toISOString(),
      quorumPercent: 50,
      passThresholdPercent: 60,
      proposalType: ProposalType.CONTRACT_UPGRADE,
    };
    await expect(
      service.createProposal('admin-1', dto),
    ).rejects.toThrow('until staking data is supported');
  });
});
