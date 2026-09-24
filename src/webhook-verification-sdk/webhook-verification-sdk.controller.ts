import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WebhookVerificationSdkService } from './webhook-verification-sdk.service';
import { VerifyWebhookSignatureDto } from './dto/verify-webhook-signature.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';

@ApiTags('Webhook Verification SDK')
@Controller('v2/webhook-verification-sdk')
export class WebhookVerificationSdkController {
  constructor(private readonly service: WebhookVerificationSdkService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary:
      'Describe the NexaFX webhook signature scheme implemented by this module',
  })
  @ApiResponse({ status: 200, description: 'Signature scheme metadata' })
  getSpec() {
    return this.service.getSpec();
  }

  @Post('verify')
  @Public()
  @ApiOperation({
    summary:
      'Verify an X-NexaFX-Signature header against a raw payload and shared secret',
  })
  @ApiResponse({
    status: 201,
    description:
      'Verification result. A tampered payload or wrong secret returns valid=false with a reason, not an error.',
  })
  verify(@Body() dto: VerifyWebhookSignatureDto) {
    return this.service.verify(dto);
  }

  @Get('verifications')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List persisted webhook verification attempts (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Verification records, newest first' })
  listVerifications(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.service.listVerifications(
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined,
    );
  }
}