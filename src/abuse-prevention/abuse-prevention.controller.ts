import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AbusePreventionService } from './abuse-prevention.service';
import { SignalType } from './entities/abuse-signal.entity';

@Controller('v2/abuse-prevention')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AbusePreventionController {
  constructor(private readonly abuseService: AbusePreventionService) {}

  @Get()
  @Roles('admin', 'ops')
  async listOpenSignals(@Query('page') page = 1, @Query('limit') limit = 20) {
    return await this.abuseService.getOpenSignals(Number(page), Number(limit));
  }

  @Post('report')
  @Roles('admin', 'ops')
  async manualReport(
    @Body('userId') userId: string,
    @Body('signalType') signalType: SignalType,
    @Body('score') score: number,
    @Body('evidence') evidence?: Record<string, any>,
  ) {
    return await this.abuseService.manualReport(userId, signalType, score, evidence);
  }
}
import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { AbusePreventionService } from './abuse-prevention.service';

/**
 * Stub controller for v2 feature: abuse-prevention (issue #489).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #489.
 */
@Controller('v2/abuse-prevention')
export class AbusePreventionController {
  constructor(private readonly service: AbusePreventionService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #489 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #489 - scaffold stub');
  }
}
