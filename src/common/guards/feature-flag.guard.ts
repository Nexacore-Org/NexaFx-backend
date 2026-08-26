import {
  CanActivate,
  ExecutionContext,
  Injectable,
  mixin,
  NotFoundException,
} from '@nestjs/common';
import { FlagsService } from '../../modules/flags/flags.service';

export function FeatureFlagGuard(flagKey: string) {
  @Injectable()
  class MixinFeatureFlagGuard implements CanActivate {
    constructor(private readonly flagsService: FlagsService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      // Assume JwtAuthGuard has run first to populate request.user
      const userId = request.user?.userId;

      const isEnabled = await this.flagsService.isEnabled(flagKey, userId);

      if (!isEnabled) {
        throw new NotFoundException(); // 404 not 403 to prevent feature discovery
      }

      return true;
    }
  }

  return mixin(MixinFeatureFlagGuard);
}
