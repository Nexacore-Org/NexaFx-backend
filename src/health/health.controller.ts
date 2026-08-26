import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /health — overall health (alias for readiness).
   */
  @Public()
  @Get()
  async check() {
    return this.healthService.checkHealth();
  }

  /**
   * GET /health/live — liveness probe.
   *
   * Returns fast, checks nothing external.  An orchestrator uses this
   * to decide whether to restart the container / pod.
   */
  @Public()
  @Get('live')
  checkLiveness() {
    return this.healthService.checkLiveness();
  }

  /**
   * GET /health/ready — readiness probe.
   *
   * Checks every hard runtime dependency (database, Redis, Stellar
   * Horizon, BullMQ).  The instance is marked "error" when any
   * *configured* dependency is unreachable.
   */
  @Public()
  @Get('ready')
  async checkReadiness() {
    return this.healthService.checkReadiness();
  }
}
