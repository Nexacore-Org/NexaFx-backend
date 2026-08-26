import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import { IndexAdvisorService } from './index-advisor.service';

@ApiTags('Admin-DB-Advisory')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/db/index-advisory')
export class DbAdvisoryController {
  constructor(private readonly indexAdvisorService: IndexAdvisorService) {}

  @Get('latest')
  @ApiOperation({
    summary: 'Get latest index advisory report',
    description: 'Returns the most recent database index advisory analysis.',
  })
  @ApiResponse({
    status: 200,
    description: 'Latest advisory report',
  })
  async getLatestReport() {
    return this.indexAdvisorService.getLatestReport();
  }

  @Get('history')
  @ApiOperation({
    summary: 'Get advisory report history',
    description: 'Returns paginated list of past advisory reports.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Paginated advisory reports',
  })
  async getReportHistory(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.indexAdvisorService.getReportHistory(
      page ?? 1,
      limit ?? 20,
    );
  }

  @Post('run')
  @ApiOperation({
    summary: 'Trigger manual index advisory analysis',
    description:
      'Runs a full database index advisory analysis and returns the report.',
  })
  @ApiResponse({
    status: 200,
    description: 'Advisory analysis report',
  })
  async runAnalysis() {
    return this.indexAdvisorService.analyse();
  }

  @Get('latest/migration')
  @ApiOperation({
    summary: 'Get suggested migration SQL',
    description:
      'Returns the suggested CREATE INDEX and DROP INDEX statements from the latest report.',
  })
  @ApiResponse({
    status: 200,
    description: 'Suggested migration SQL',
  })
  async getLatestMigration() {
    const sql = await this.indexAdvisorService.getLatestMigrationSQL();
    return { sql };
  }
}
