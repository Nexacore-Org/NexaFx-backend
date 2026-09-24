import { Controller, Get, UseGuards, Headers } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MobileSdkGuideService, MobileManifestResponse } from './mobile-sdk-guide.service';

/**
 * Controller for v2 feature: mobile-sdk-guide (issue #490).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 */
@Controller('v2/mobile-sdk-guide')
@UseGuards(JwtAuthGuard)
export class MobileSdkGuideController {
  constructor(private readonly sdkGuideService: MobileSdkGuideService) {}

  @Get('manifest')
  getManifest(@Headers('x-client-version') clientVersion?: string): MobileManifestResponse {
    return this.sdkGuideService.getManifest(clientVersion);
  }
}
