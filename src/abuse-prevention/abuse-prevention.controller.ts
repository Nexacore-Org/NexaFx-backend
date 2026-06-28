import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { AbusePreventionService } from './abuse-prevention.service';

/**
 * Stub controller for v2 feature: abuse-prevention (issue #489).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #489.
 */
@Controller('v2/abuse-prevention')
export class AbusePreventionController {
  constructor(private readonly service: AbusePreventionService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #489 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #489 - scaffold stub');
  }
}
