import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { RateAlertsEnhancementService } from './rate-alerts-enhancement.service';

/**
 * Stub controller for v2 feature: rate-alerts-enhancement (issue #503).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #503.
 */
@Controller('v2/rate-alerts-enhancement')
export class RateAlertsEnhancementController {
  constructor(private readonly service: RateAlertsEnhancementService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #503 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #503 - scaffold stub');
  }
}
