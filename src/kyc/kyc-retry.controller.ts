import { Controller, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { PendingRetryService } from './pending-retry.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('v2/kyc/pending-retry')
@UseGuards(JwtAuthGuard)
export class KycRetryController {
  constructor(private readonly pendingRetryService: PendingRetryService) {}

  @Post()
  async storeRetry(@Req() req: any, @Body() body: { originalRequest: any }) {
    return this.pendingRetryService.storePendingRetry(req.user.id, body.originalRequest);
  }

  @Post(':id/execute')
  async executeRetry(@Req() req: any, @Param('id') id: string) {
    return this.pendingRetryService.executePendingRetry(id, req.user.id, req);
  }
}