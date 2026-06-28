import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { PlatformHealthRunbookService } from './platform-health-runbook.service';

/**
 * Stub controller for v2 feature: platform-health-runbook (issue #501).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #501.
 */
@Controller('v2/platform-health-runbook')
export class PlatformHealthRunbookController {
  constructor(private readonly service: PlatformHealthRunbookService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #501 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #501 - scaffold stub');
  }
}
