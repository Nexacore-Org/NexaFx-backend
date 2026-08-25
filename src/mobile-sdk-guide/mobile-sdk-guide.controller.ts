import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust to your auth guard path
import { MobileSdkGuideService, MobileManifestResponse } from './mobile-sdk-guide.service';

@Controller('v2/mobile-sdk-guide')
@UseGuards(JwtAuthGuard)
export class MobileSdkGuideController {
  constructor(private readonly sdkGuideService: MobileSdkGuideService) {}

  @Get('manifest')
  getManifest(@Headers('x-client-version') clientVersion?: string): MobileManifestResponse {
    return this.sdkGuideService.getManifest(clientVersion);
  }
}
import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { MobileSdkGuideService } from './mobile-sdk-guide.service';

/**
 * Stub controller for v2 feature: mobile-sdk-guide (issue #490).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #490.
 */
@Controller('v2/mobile-sdk-guide')
export class MobileSdkGuideController {
  constructor(private readonly service: MobileSdkGuideService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #490 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #490 - scaffold stub');
  }
}
