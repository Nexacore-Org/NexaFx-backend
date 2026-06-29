import { Controller, Get, Post, Body, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ExperimentsService } from './experiments.service';
import { TrackEventDto } from './dto/track-event.dto';

@ApiTags('Experiments')
@ApiBearerAuth('access-token')
@Controller('experiments')
export class ExperimentsController {
  constructor(private readonly experimentsService: ExperimentsService) {}

  @Get('assignments')
  @ApiOperation({
    summary: 'Get all active experiment assignments for the current user',
  })
  async getAssignments(@Request() req: { user: { userId: string } }) {
    return this.experimentsService.getUserAssignments(req.user.userId);
  }

  @Post('events')
  @ApiOperation({ summary: 'Track a conversion event for an experiment' })
  @ApiResponse({ status: 201, description: 'Event tracked' })
  async trackEvent(
    @Request() req: { user: { userId: string } },
    @Body() dto: TrackEventDto,
  ) {
    await this.experimentsService.trackEvent(
      dto.experimentKey,
      req.user.userId,
      dto.eventName,
      dto.metadata,
    );
    return { success: true };
  }
}
