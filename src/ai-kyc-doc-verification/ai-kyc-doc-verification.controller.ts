import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { AiKycDocVerificationService } from './ai-kyc-doc-verification.service';

/**
 * Stub controller for v2 feature: ai-kyc-doc-verification (issue #493).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #493.
 */
@Controller('v2/ai-kyc-doc-verification')
export class AiKycDocVerificationController {
  constructor(private readonly service: AiKycDocVerificationService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #493 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #493 - scaffold stub');
  }
}
