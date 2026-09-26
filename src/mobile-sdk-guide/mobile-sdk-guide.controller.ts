import { Controller, Get, UseGuards, Headers, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MobileSdkGuideService, MobileManifestResponse } from './mobile-sdk-guide.service';
import { GetManifestQueryDto } from './dto/get-manifest-query.dto';

/**
 * Controller for v2 feature: mobile-sdk-guide (issue #490).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 */
@ApiTags('mobile-sdk-guide')
@Controller('v2/mobile-sdk-guide')
@UseGuards(JwtAuthGuard)
export class MobileSdkGuideController {
  constructor(private readonly sdkGuideService: MobileSdkGuideService) {}

  @Get('manifest')
  @ApiOperation({
    summary: 'Get the mobile SDK bootstrap manifest',
    description:
      'Returns SDK version info, supported endpoints, and auth flow metadata for a mobile client bootstrapping against the API.',
  })
  @ApiHeader({
    name: 'x-client-version',
    required: false,
    description: 'Semantic version of the calling mobile client (e.g. 1.4.0).',
  })
  @ApiQuery({
    name: 'platform',
    required: false,
    enum: ['ios', 'android'],
    description: 'Target platform for the manifest.',
  })
  @ApiResponse({ status: 200, description: 'Manifest returned successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid authentication.' })
  async getManifest(
    @Headers('x-client-version') clientVersion?: string,
    @Query() query?: GetManifestQueryDto,
  ): Promise<MobileManifestResponse> {
    return this.sdkGuideService.getManifest(clientVersion, query?.platform);
  }
}
