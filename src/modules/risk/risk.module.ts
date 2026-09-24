import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CustomerRiskRating } from './entities/customer-risk-rating.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../users/entities/user.entity';
import { RiskService } from './risk.service';
import { RiskController } from './risk.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerRiskRating, Transaction, User]),
    ScheduleModule,
  ],
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
