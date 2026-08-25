import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { LoadTestingService } from './load-testing.service';

/**
 * Stub controller for v2 feature: load-testing (issue #491).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #491.
 */
@Controller('v2/load-testing')
export class LoadTestingController {
  constructor(private readonly service: LoadTestingService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #491 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #491 - scaffold stub');
  }
}
