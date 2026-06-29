import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { StellarAuditTrailService } from './stellar-audit-trail.service';

/**
 * Stub controller for v2 feature: stellar-audit-trail (issue #506).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #506.
 */
@Controller('v2/stellar-audit-trail')
export class StellarAuditTrailController {
  constructor(private readonly service: StellarAuditTrailService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #506 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #506 - scaffold stub');
  }
}
