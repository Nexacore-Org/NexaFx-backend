import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { DataResidencyService } from './data-residency.service';

/**
 * Stub controller for v2 feature: data-residency (issue #496).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #496.
 */
@Controller('v2/data-residency')
export class DataResidencyController {
  constructor(private readonly service: DataResidencyService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #496 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #496 - scaffold stub');
  }
}
