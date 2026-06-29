import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { FraudRiskScoringService } from './fraud-risk-scoring.service';

/**
 * Stub controller for v2 feature: fraud-risk-scoring (issue #497).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #497.
 */
@Controller('v2/fraud-risk-scoring')
export class FraudRiskScoringController {
  constructor(private readonly service: FraudRiskScoringService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #497 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #497 - scaffold stub');
  }
}
