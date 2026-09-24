import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminBulkService } from './admin-bulk.service';

interface AuthedRequest {
  user: { userId: string };
}

@ApiTags('admin-bulk')
@Controller('admin/bulk')
export class AdminBulkController {
  constructor(private readonly service: AdminBulkService) {}

  /** #708: step 1 — preview a bulk action. */
  @ApiOperation({ summary: 'Preview a bulk action' })
  @Post(':actionType/preview')
  preview(
    @Req() req: AuthedRequest,
    @Param('actionType') actionType: string,
    @Body() body: { targetIds: string[] },
  ) {
    return this.service.preview(req.user.userId, actionType, body?.targetIds);
  }

  /** #708: step 2 — confirm and execute a previewed bulk action. */
  @ApiOperation({ summary: 'Execute a previewed bulk action' })
  @Post(':actionType/execute')
  execute(@Body() body: { bulkActionId: string }) {
    return this.service.execute(body?.bulkActionId);
  }

  /** #708: bulk action progress. */
  @ApiOperation({ summary: 'Get bulk action status' })
  @Get(':bulkActionId/status')
  status(@Param('bulkActionId') bulkActionId: string) {
    return this.service.getStatus(bulkActionId);
  }
}
