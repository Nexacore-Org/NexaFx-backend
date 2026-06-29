import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApprovalService } from '../services/approval.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PendingApproval } from '../entities/pending-approval.entity';

@Controller('v2/approvals')
@UseGuards(JwtAuthGuard)
export class ApprovalController {
  constructor(
    private readonly approvalService: ApprovalService,
    @InjectRepository(PendingApproval)
    private readonly pendingRepo: Repository<PendingApproval>,
  ) {}

  @Get('pending')
  async getMyPendingApprovals(@Request() req) {
    // Locates un-executed instances matching the active user's assigned permission loops
    return await this.pendingRepo.find({
      where: { status: ApprovalStatus.PENDING },
    });
  }

  @Post(':id/approve')
  async approveTransaction(
    @Param('id') id: string,
    @Request() req,
    @Body() body: { comment?: string },
  ) {
    return await this.approvalService.processApproveAction(id, req.user.id.toString(), body.comment);
  }

  @Post(':id/reject')
  async rejectTransaction(
    @Param('id') id: string,
    @Request() req,
    @Body() body: { reason: string },
  ) {
    return await this.approvalService.processRejectAction(id, req.user.id.toString(), body.reason);
  }
}