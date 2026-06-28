import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { SorobanIntegrationService } from './soroban-integration.service';

/**
 * Stub controller for v2 feature: soroban-integration (issue #486).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #486.
 */
@Controller('v2/soroban-integration')
export class SorobanIntegrationController {
  constructor(private readonly service: SorobanIntegrationService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #486 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #486 - scaffold stub');
  }
}
