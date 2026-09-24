import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { ConditionalPaymentFlowsService } from './conditional-payment-flows.service';

/**
 * Stub controller for v2 feature: conditional-payment-flows (issue #487).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #487.
 */
@Controller('v2/conditional-payment-flows')
export class ConditionalPaymentFlowsController {
  constructor(private readonly service: ConditionalPaymentFlowsService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #487 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #487 - scaffold stub');
  }
}
