import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User, UserKycTier } from '../users/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { LoanApplication, LoanStatus } from './entities/loan-application.entity';
import { ComplianceFlag } from './entities/compliance-flag.entity';

@Injectable()
export class CreditScoringService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(LoanApplication)
    private readonly loanRepo: Repository<LoanApplication>,
    @InjectRepository(ComplianceFlag)
    private readonly complianceFlagRepo: Repository<ComplianceFlag>,
  ) {}

  async score(userId: string): Promise<number> {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    let score = 0;

    // +20: KYC tier = ENHANCED (or FULL, which is higher)
    if (
      user.kycTier === UserKycTier.ENHANCED ||
      user.kycTier === UserKycTier.FULL
    ) {
      score += 20;
    }

    // +20: account age > 6 months
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    if (user.createdAt < sixMonthsAgo) {
      score += 20;
    }

    // +20: transaction count > 20 in last 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const txCount = await this.transactionRepo.count({
      where: { userId, createdAt: MoreThan(ninetyDaysAgo) },
    });
    if (txCount > 20) {
      score += 20;
    }

    // Compliance flags in last 6 months
    const openFlagsCount = await this.complianceFlagRepo.count({
      where: { userId, isResolved: false, createdAt: MoreThan(sixMonthsAgo) },
    });

    // +20: no compliance flags in last 6 months
    if (openFlagsCount === 0) {
      score += 20;
    }

    // -10: per open compliance flag
    score -= openFlagsCount * 10;

    // +10: successful repayment of previous loan
    const repaidCount = await this.loanRepo.count({
      where: { userId, status: LoanStatus.REPAID },
    });
    if (repaidCount > 0) {
      score += 10;
    }

    // -20: previous loan defaulted
    const defaultedCount = await this.loanRepo.count({
      where: { userId, status: LoanStatus.DEFAULTED },
    });
    if (defaultedCount > 0) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }
}
