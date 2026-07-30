import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { MerchantIntegrationService } from './merchant-integration.service';

/**
 * Stub controller for v2 feature: merchant-integration (issue #495).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #495.
 */
@Controller('v2/merchant-integration')
export class MerchantIntegrationController {
  constructor(private readonly service: MerchantIntegrationService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #495 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #495 - scaffold stub');
  }
}
