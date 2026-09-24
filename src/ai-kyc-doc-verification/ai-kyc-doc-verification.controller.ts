import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiKycDocVerificationService } from './ai-kyc-doc-verification.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('AI KYC Document Verification')
@ApiBearerAuth('access-token')
@Controller('v2/ai-kyc-doc-verification')
@UseGuards(JwtAuthGuard)
export class AiKycDocVerificationController {
  constructor(private readonly service: AiKycDocVerificationService) {}

  @Post('verify')
  @ApiOperation({ summary: 'Trigger AI-assisted verification of a KYC application document' })
  @ApiResponse({ status: 200, description: 'AI verification run completed' })
  async verifyApplication(@Body() body: { kycApplicationId: string; simulatedOcr?: any }) {
    return this.service.verifyApplication(body.kycApplicationId, body.simulatedOcr);
  }
}
