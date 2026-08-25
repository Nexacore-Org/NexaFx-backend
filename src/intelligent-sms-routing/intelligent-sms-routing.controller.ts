import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { IntelligentSmsRoutingService } from './intelligent-sms-routing.service';

/**
 * Stub controller for v2 feature: intelligent-sms-routing (issue #507).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #507.
 */
@Controller('v2/intelligent-sms-routing')
export class IntelligentSmsRoutingController {
  constructor(private readonly service: IntelligentSmsRoutingService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #507 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #507 - scaffold stub');
  }
}
