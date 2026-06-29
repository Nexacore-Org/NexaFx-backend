import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { ZeroDowntimeDeploymentService } from './zero-downtime-deployment.service';

/**
 * Stub controller for v2 feature: zero-downtime-deployment (issue #504).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #504.
 */
@Controller('v2/zero-downtime-deployment')
export class ZeroDowntimeDeploymentController {
  constructor(private readonly service: ZeroDowntimeDeploymentService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #504 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #504 - scaffold stub');
  }
}
