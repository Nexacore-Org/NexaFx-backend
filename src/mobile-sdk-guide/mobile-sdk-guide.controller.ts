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