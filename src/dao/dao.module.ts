import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DaoService } from './dao.service';
import { DaoController } from './dao.controller';
import { ProposalController } from './controllers/proposal.controller';
import { ProposalService } from './services/proposal.service';
import { RewardDistribution } from './entities/reward-distribution.entity';
import { Proposal } from './entities/proposal.entity';
import { Vote } from './entities/vote.entity';
import { User } from '../users/user.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RewardDistribution, Proposal, Vote, User]),
    AuditLogsModule,
    UsersModule,
  ],
  controllers: [DaoController, ProposalController],
  providers: [DaoService, ProposalService],
  exports: [DaoService, ProposalService],
})
export class DaoModule {}
