import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { PlatformHealthRunbookService } from './platform-health-runbook.service';

@ApiTags('Platform Health Runbook')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('v2/platform-health-runbook')
export class PlatformHealthRunbookController {
  constructor(
    private readonly platformHealthRunbookService: PlatformHealthRunbookService,
  ) {}

  @Get('snapshot')
  @ApiOperation({
    summary: 'Get platform health snapshot',
    description:
      'Aggregates cron job status, queue depths, DB pool stats, and recent 5xx errors for incident response',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform health snapshot retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - ADMIN role required' })
  async getSnapshot() {
    return this.platformHealthRunbookService.getSnapshot();
  }
}
