import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { CustomerRiskRating, RiskRating } from './entities/customer-risk-rating.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class RiskService {
  constructor(
    @InjectRepository(CustomerRiskRating)
    private readonly ratingRepo: Repository<CustomerRiskRating>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async assessUser(userId: string): Promise<CustomerRiskRating> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    const transactions = await this.transactionRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const factors: Record<string, number> = {};

    // Transaction volume risk (0-25)
    const totalVolume = transactions.reduce((sum, tx) => sum + parseFloat(tx.amount || '0'), 0);
    factors.transactionVolume = Math.min(25, Math.floor(totalVolume / 10000) * 5);

    // Transaction frequency risk (0-20)
    const txCount = transactions.length;
    factors.transactionFrequency = Math.min(20, Math.floor(txCount / 5) * 2);

    // Geographic risk (0-15)
    factors.geographicRisk = 5; // default moderate

    // Account age risk (0-15)
    const accountAgeDays = user?.createdAt
      ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    factors.accountAge = Math.max(0, 15 - Math.floor(accountAgeDays / 30));

    // KYC level risk (0-15)
    const kycMap: Record<string, number> = { BASIC: 15, STANDARD: 8, ENHANCED: 0 };
    factors.kycLevel = kycMap[user?.kycLevel || 'BASIC'] ?? 15;

    // Previous flags risk (0-10)
    factors.previousFlags = (user?.flagCount || 0) * 2;
    factors.previousFlags = Math.min(10, factors.previousFlags);

    const score = Math.min(100, Object.values(factors).reduce((sum, v) => sum + v, 0));

    let rating: RiskRating;
    let assessmentMonths: number;
    if (score <= 25) {
      rating = RiskRating.LOW;
      assessmentMonths = 12;
    } else if (score <= 50) {
      rating = RiskRating.MEDIUM;
      assessmentMonths = 6;
    } else if (score <= 75) {
      rating = RiskRating.HIGH;
      assessmentMonths = 3;
    } else {
      rating = RiskRating.VERY_HIGH;
      assessmentMonths = 1;
    }

    const now = new Date();
    const nextDue = new Date(now);
    nextDue.setMonth(nextDue.getMonth() + assessmentMonths);

    let existing = await this.ratingRepo.findOne({ where: { userId } });
    if (existing) {
      existing.score = score;
      existing.rating = rating;
      existing.factors = factors;
      existing.lastAssessedAt = now;
      existing.nextAssessmentDue = nextDue;
      return this.ratingRepo.save(existing);
    }

    const newRating = this.ratingRepo.create({
      userId,
      score,
      rating,
      factors,
      lastAssessedAt: now,
      nextAssessmentDue: nextDue,
    });
    return this.ratingRepo.save(newRating);
  }

  @Cron('0 2 * * *')
  async dailyAssessment(): Promise<void> {
    const dueRatings = await this.ratingRepo.find({
      where: { nextAssessmentDue: new Date() as any },
    });

    for (const entry of dueRatings) {
      await this.assessUser(entry.userId);
    }
  }

  async overrideRating(userId: string, rating: RiskRating, reason: string): Promise<CustomerRiskRating> {
    let existing = await this.ratingRepo.findOne({ where: { userId } });
    if (!existing) {
      existing = this.ratingRepo.create({
        userId,
        score: 0,
        rating,
        factors: { overrideReason: reason },
        lastAssessedAt: new Date(),
        nextAssessmentDue: new Date(),
      });
    } else {
      existing.rating = rating;
      existing.factors = { ...existing.factors, overrideReason: reason };
      existing.lastAssessedAt = new Date();
    }
    return this.ratingRepo.save(existing);
  }

  async getUserRating(userId: string): Promise<CustomerRiskRating> {
    let rating = await this.ratingRepo.findOne({ where: { userId } });
    if (!rating) {
      rating = await this.assessUser(userId);
    }
    return rating;
  }

  async getHighRiskUsers(): Promise<CustomerRiskRating[]> {
    return this.ratingRepo.find({
      where: [
        { rating: RiskRating.HIGH },
        { rating: RiskRating.VERY_HIGH },
      ],
      order: { score: 'DESC' },
    });
  }
}
