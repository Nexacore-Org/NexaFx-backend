import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { CustomReportsService } from './custom-reports.service';

/**
 * Stub controller for v2 feature: custom-reports (issue #505).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #505.
 */
@Controller('v2/custom-reports')
export class CustomReportsController {
  constructor(private readonly service: CustomReportsService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #505 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #505 - scaffold stub');
  }
}
