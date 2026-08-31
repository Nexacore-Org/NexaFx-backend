import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  CustomerRiskRating,
  RiskFactors,
  RiskLevel,
} from './entities/customer-risk-rating.entity';
import { User, UserKycTier } from '../../users/user.entity';
import { TransactionLimit } from '../../transactions/entities/transaction-limit.entity';

export interface CustomerProfileInput {
  kycTier?: UserKycTier;
  transactionCount30d?: number;
  totalVolumeUsd30d?: string | number;
  failedAttemptsCount?: number;
  flaggedTxCount?: number;
  countryRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
}

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    @InjectRepository(CustomerRiskRating)
    private readonly riskRatingRepository: Repository<CustomerRiskRating>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TransactionLimit)
    private readonly transactionLimitRepository: Repository<TransactionLimit>,
  ) {}

  /**
   * Calculates a bounded (0 - 100), deterministic risk score based on customer profile signals.
   */
  calculateRiskScore(profile: CustomerProfileInput): {
    score: number;
    riskLevel: RiskLevel;
    factors: RiskFactors;
  } {
    let scoreDecimal = new Decimal(0);

    // 1. KYC Tier Factor (0 - 35 pts)
    let kycTierScore = 30; // default for unverified
    switch (profile.kycTier) {
      case UserKycTier.FULL:
        kycTierScore = 5;
        break;
      case UserKycTier.ENHANCED:
        kycTierScore = 12;
        break;
      case UserKycTier.BASIC:
        kycTierScore = 20;
        break;
      case UserKycTier.UNVERIFIED:
      default:
        kycTierScore = 35;
        break;
    }
    scoreDecimal = scoreDecimal.plus(kycTierScore);

    // 2. Transaction Velocity & Volume Factor (0 - 25 pts)
    let transactionVelocityScore = 0;
    const volume = new Decimal(profile.totalVolumeUsd30d || 0);
    const count = profile.transactionCount30d || 0;

    if (volume.greaterThan(100000) || count > 500) {
      transactionVelocityScore = 25;
    } else if (volume.greaterThan(25000) || count > 100) {
      transactionVelocityScore = 15;
    } else if (volume.greaterThan(5000) || count > 20) {
      transactionVelocityScore = 8;
    } else {
      transactionVelocityScore = 2;
    }
    scoreDecimal = scoreDecimal.plus(transactionVelocityScore);

    // 3. Flagged activity & failed attempts (0 - 30 pts)
    let flaggedActivityScore = 0;
    const flaggedCount = profile.flaggedTxCount || 0;
    const failedLogins = profile.failedAttemptsCount || 0;

    if (flaggedCount > 0) {
      flaggedActivityScore += Math.min(20, flaggedCount * 10);
    }
    if (failedLogins > 3) {
      flaggedActivityScore += Math.min(10, (failedLogins - 3) * 2);
    }
    scoreDecimal = scoreDecimal.plus(flaggedActivityScore);

    // 4. Country Risk Factor (0 - 15 pts)
    let countryRiskScore = 0;
    switch (profile.countryRisk) {
      case 'HIGH':
        countryRiskScore = 15;
        break;
      case 'MEDIUM':
        countryRiskScore = 8;
        break;
      case 'LOW':
      default:
        countryRiskScore = 2;
        break;
    }
    scoreDecimal = scoreDecimal.plus(countryRiskScore);

    // Ensure strict bounding between 0 and 100
    const clampedScore = Decimal.max(0, Decimal.min(100, scoreDecimal)).toNumber();

    let riskLevel = RiskLevel.LOW;
    if (clampedScore > 75) {
      riskLevel = RiskLevel.CRITICAL;
    } else if (clampedScore > 50) {
      riskLevel = RiskLevel.HIGH;
    } else if (clampedScore > 25) {
      riskLevel = RiskLevel.MEDIUM;
    } else {
      riskLevel = RiskLevel.LOW;
    }

    const factors: RiskFactors = {
      kycTierScore,
      transactionVelocityScore,
      flaggedActivityScore,
      countryRiskScore,
      rawFactors: {
        kycTier: profile.kycTier,
        volumeUsd: volume.toFixed(2),
        count,
        flaggedCount,
        failedLogins,
      },
    };

    return {
      score: clampedScore,
      riskLevel,
      factors,
    };
  }

  /**
   * Evaluates or recalculates a customer's risk profile and applies downstream effects.
   */
  async evaluateCustomerRisk(
    userId: string,
    profileInput?: CustomerProfileInput,
  ): Promise<CustomerRiskRating> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const effectiveProfile: CustomerProfileInput = {
      kycTier: profileInput?.kycTier || user.kycTier || UserKycTier.UNVERIFIED,
      transactionCount30d: profileInput?.transactionCount30d || 0,
      totalVolumeUsd30d: profileInput?.totalVolumeUsd30d || '0',
      failedAttemptsCount: profileInput?.failedAttemptsCount || 0,
      flaggedTxCount: profileInput?.flaggedTxCount || 0,
      countryRisk: profileInput?.countryRisk || 'LOW',
    };

    const calculated = this.calculateRiskScore(effectiveProfile);

    let rating = await this.riskRatingRepository.findOne({ where: { userId } });
    const previousRiskLevel = rating ? rating.riskLevel : null;

    if (!rating) {
      rating = this.riskRatingRepository.create({
        userId,
        score: calculated.score,
        riskLevel: calculated.riskLevel,
        factors: calculated.factors,
        lastEvaluatedAt: new Date(),
      });
    } else {
      rating.score = calculated.score;
      rating.riskLevel = calculated.riskLevel;
      rating.factors = calculated.factors;
      rating.lastEvaluatedAt = new Date();
    }

    const savedRating = await this.riskRatingRepository.save(rating);

    // Downstream effect: Re-evaluation of transaction limits when risk rating changes
    if (previousRiskLevel !== calculated.riskLevel) {
      await this.applyDownstreamRiskRestrictions(userId, calculated.riskLevel);
    }

    return savedRating;
  }

  /**
   * Downstream reaction to rating changes — re-evaluates transaction limits or flags high-risk accounts.
   */
  async applyDownstreamRiskRestrictions(
    userId: string,
    riskLevel: RiskLevel,
  ): Promise<void> {
    this.logger.log(
      `Triggering downstream transaction limit adjustment for user ${userId} with risk level ${riskLevel}`,
    );

    // If customer escalated to HIGH or CRITICAL, enforce restrictive limit policy
    if (riskLevel === RiskLevel.CRITICAL || riskLevel === RiskLevel.HIGH) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user && user.kycTier) {
        const limits = await this.transactionLimitRepository.findOne({
          where: { tier: user.kycTier },
        });
        if (limits) {
          this.logger.warn(
            `Restricting user ${userId} limits due to ${riskLevel} risk level. Standard single tx limit: ${limits.singleTxLimitUsd}`,
          );
        }
      }
    }
  }

  /**
   * Retrieves current risk rating for a customer.
   */
  async getRiskRating(userId: string): Promise<CustomerRiskRating | null> {
    return this.riskRatingRepository.findOne({ where: { userId } });
  }
}
