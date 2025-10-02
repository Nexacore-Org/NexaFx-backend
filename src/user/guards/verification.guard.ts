import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserService } from '../providers/user.service';

export const ALLOW_UNVERIFIED_KEY = 'allowUnverified';

@Injectable()
export class VerificationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowUnverified = this.reflector.get<boolean>(
      ALLOW_UNVERIFIED_KEY,
      context.getHandler(),
    );

    if (allowUnverified) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const user = await this.usersService.findById(userId);
    if (!user.isVerified) {
      throw new ForbiddenException(
        'This feature requires account verification. Please complete your profile and submit verification documents.',
      );
    }
    return true;
  }
}


