import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { DashboardPreferencesService } from './dashboard-preferences.service';

/**
 * Stub controller for v2 feature: dashboard-preferences (issue #498).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #498.
 */
@Controller('v2/dashboard-preferences')
export class DashboardPreferencesController {
  constructor(private readonly service: DashboardPreferencesService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #498 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #498 - scaffold stub');
  }
}
