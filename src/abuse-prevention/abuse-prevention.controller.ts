import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AbusePreventionService } from './abuse-prevention.service';
import { SignalType } from './entities/abuse-signal.entity';
import { ListSignalsQueryDto } from './dto/list-signals-query.dto';
import { ManualReportDto } from './dto/manual-report.dto';
import { ClearSignalDto } from './dto/clear-signal.dto';

@ApiTags('abuse-prevention')
@Controller('v2/abuse-prevention')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AbusePreventionController {
  constructor(private readonly abuseService: AbusePreventionService) {}

  @Get()
  @Roles('admin', 'ops')
  @ApiOperation({ summary: 'List open abuse signals' })
  @ApiResponse({ status: 200, description: 'Paginated list of open abuse signals' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async listOpenSignals(@Query() query: ListSignalsQueryDto) {
    return await this.abuseService.getOpenSignals(query.page, query.limit);
  }

  @Post('report')
  @Roles('admin', 'ops')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Manually report an abuse signal for a user' })
  @ApiResponse({ status: 201, description: 'Abuse signal recorded' })
  @ApiResponse({ status: 400, description: 'Invalid payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async manualReport(@Body() dto: ManualReportDto) {
    return await this.abuseService.manualReport(
      dto.userId,
      dto.signalType,
      dto.score,
      dto.evidence,
    );
  }

  @Patch(':id/clear')
  @Roles('admin')
  @ApiOperation({ summary: 'Review and clear an abuse signal' })
  @ApiResponse({ status: 200, description: 'Abuse signal cleared' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Abuse signal not found' })
  async clearSignal(@Param('id') id: string, @Body() dto: ClearSignalDto) {
    return await this.abuseService.clearSignal(id, dto.reviewerId, dto.reason);
  }
}
