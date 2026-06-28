import { Injectable } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheckResult,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@Injectable()
export class HealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbIndicator: TypeOrmHealthIndicator,
  ) {}

  checkHealth(): Promise<HealthCheckResult> {
    return this.health.check([() => this.dbIndicator.pingCheck('database')]);
  }
}
