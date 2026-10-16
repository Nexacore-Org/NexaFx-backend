import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /health — overall health (alias for readiness).
   *
   * Returns 503 when a critical dependency (database, Redis/BullMQ)
   * is unreachable so load balancers and orchestrators can detect
   * broken instances.  Degraded dependencies (Stellar, Mailgun) are
   * reported in the body but do not fail the probe.
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
   * *critical* dependency is unreachable, in which case the service
   * throws a 503 ServiceUnavailableException.  Degraded dependencies
   * (Stellar, Mailgun) are reported in the body but keep the probe at
   * 200 so a third-party outage does not evict every pod at once.
   */
  @Public()
  @Get('ready')
  async checkReadiness() {
    return this.healthService.checkReadiness();
  }
}
