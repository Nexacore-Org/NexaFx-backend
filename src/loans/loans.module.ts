import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoanApplication } from './entities/loan-application.entity';
import { LoanRepayment } from './entities/loan-repayment.entity';
import { ComplianceFlag } from './entities/compliance-flag.entity';
import { CreditScoringService } from './credit-scoring.service';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { UsersModule } from '../users/users.module';
import { Transaction } from '../transactions/entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LoanApplication,
      LoanRepayment,
      ComplianceFlag,
      Transaction,
    ]),
    UsersModule,
  ],
  controllers: [LoansController],
  providers: [LoansService, CreditScoringService],
  exports: [LoansService],
})
export class LoansModule {}
