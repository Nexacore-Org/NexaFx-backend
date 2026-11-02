import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UnifiedActivityFeedService } from './unified-activity-feed.service';
import { GetActivityFeedQueryDto } from './dto/get-activity-feed-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';

export { GetActivityFeedQueryDto };

@ApiTags('Activity Feed')
@ApiBearerAuth('access-token')
@Controller({ path: 'unified-activity-feed', version: '2' })
@UseGuards(JwtAuthGuard)
export class UnifiedActivityFeedController {
  constructor(private readonly service: UnifiedActivityFeedService) {}

  @Get()
  @ApiOperation({
    summary: 'Get paginated activity feed for the authenticated user',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Cursor for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items to return (1–100)',
  })
  @ApiResponse({ status: 200, description: 'Paginated activity feed items' })
  @ApiResponse({
    status: 400,
    description: 'Invalid limit or malformed pagination cursor',
  })
  async getFeed(
    @Req() req: any,
    @Query() query?: GetActivityFeedQueryDto,
    @Query('limit') legacyLimit?: string | number,
  ) {
    const isDirectCursorArg = typeof (query as unknown) === 'string';
    const rawCursor = isDirectCursorArg
      ? (query as unknown as string)
      : query?.cursor;
    const rawLimit = isDirectCursorArg
      ? legacyLimit
      : (query?.limit ?? legacyLimit);

    let parsedLimit = 10;
    if (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') {
      const numericLimit =
        typeof rawLimit === 'number'
          ? rawLimit
          : typeof rawLimit === 'string' && /^\d+$/.test(rawLimit.trim())
            ? Number(rawLimit.trim())
            : Number.NaN;

      if (
        !Number.isInteger(numericLimit) ||
        numericLimit < 1 ||
        numericLimit > 100
      ) {
        throw new BadRequestException(
          'limit must be an integer between 1 and 100',
        );
      }
      parsedLimit = numericLimit;
    }

    return this.service.getFeed(req.user.userId, rawCursor, parsedLimit);
  }
}
