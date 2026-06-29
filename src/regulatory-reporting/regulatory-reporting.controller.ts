import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { RegulatoryReportingService } from './regulatory-reporting.service';

/**
 * Stub controller for v2 feature: regulatory-reporting (issue #500).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #500.
 */
@Controller('v2/regulatory-reporting')
export class RegulatoryReportingController {
  constructor(private readonly service: RegulatoryReportingService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #500 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #500 - scaffold stub');
  }
}
