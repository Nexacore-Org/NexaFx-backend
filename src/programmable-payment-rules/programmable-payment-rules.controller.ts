import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { ProgrammablePaymentRulesService } from './programmable-payment-rules.service';

/**
 * Stub controller for v2 feature: programmable-payment-rules (issue #494).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #494.
 */
@Controller('v2/programmable-payment-rules')
export class ProgrammablePaymentRulesController {
  constructor(private readonly service: ProgrammablePaymentRulesService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #494 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #494 - scaffold stub');
  }
}
