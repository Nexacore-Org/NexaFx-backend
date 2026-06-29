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
import {
  KYCApplication,
  KycStatus,
} from '../../kyc/entities/kyc-application.entity';
import type { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { User, UserKycTier } from '../../users/user.entity';

/**
 * Guard that blocks access if the authenticated user's KYC tier is NONE.
 * BASIC tier (email verified) allows limited transactions.
 * Apply using @UseGuards(KycGuard) on routes or controllers.
 *
 * A route can opt out of the check by using @SetMetadata(KYC_BYPASS_KEY, true).
 */
export const KYC_BYPASS_KEY = 'kycBypass';

@Injectable()
export class KycGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const dbUser = await this.userRepository.findOne({
      where: { id: user.userId },
    });

    if (!dbUser) {
      throw new ForbiddenException('User not found');
    }

    // NONE tier - no transactions allowed
    if (dbUser.kycTier === UserKycTier.NONE) {
      throw new ForbiddenException(
        'Email verification required. Please verify your email to access transaction features.',
      );
    }

    return true;
  }
}
