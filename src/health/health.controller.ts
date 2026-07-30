import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@Public()
@Version(VERSION_NEUTRAL)
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check() {
    return this.healthService.checkHealth();
  }

  @Get('live')
  live() {
    return this.healthService.checkLiveness();
  }

  @Get('ready')
  ready() {
    return this.healthService.checkReadiness();
  }
}
