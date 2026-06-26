import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { KycRecord, KycStatus } from '../../kyc/entities/kyc.entity';
import type { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

/**
 * Guard that blocks access if the authenticated user's KYC status is not APPROVED.
 * Apply using @UseGuards(KycGuard) on routes or controllers.
 *
 * A route can opt out of the check by using @SetMetadata(KYC_BYPASS_KEY, true).
 */
export const KYC_BYPASS_KEY = 'kycBypass';

@Injectable()
export class KycGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(KycRecord)
    private readonly kycRepository: Repository<KycRecord>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if the route is explicitly marked to bypass KYC check
    const bypass = this.reflector.getAllAndOverride<boolean>(KYC_BYPASS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (bypass) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: CurrentUserPayload }>();
    const { user } = request;

    if (!user?.userId) {
      throw new ForbiddenException('Authentication required');
    }

    const latestKyc = await this.kycRepository.findOne({
      where: { userId: user.userId },
      order: { createdAt: 'DESC' },
    });

    if (!latestKyc || latestKyc.status !== KycStatus.APPROVED) {
      throw new ForbiddenException(
        'KYC verification required. Please submit your documents and get verified before performing this action.',
      );
    }

    return true;
  }
}
