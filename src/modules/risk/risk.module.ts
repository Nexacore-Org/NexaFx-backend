import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerRiskRating } from './entities/customer-risk-rating.entity';
import { RiskService } from './risk.service';
import { RiskController } from './risk.controller';
import { User } from '../../users/user.entity';
import { TransactionLimit } from '../../transactions/entities/transaction-limit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerRiskRating, User, TransactionLimit]),
  ],
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
