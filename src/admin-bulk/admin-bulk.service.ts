import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BulkAction, BulkActionStatus } from './entities/bulk-action.entity';

const MAX_TARGETS = 500;
const CONFIRM_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class AdminBulkService {
  constructor(
    @InjectRepository(BulkAction)
    private readonly actions: Repository<BulkAction>,
  ) {}

  /** Step 1 (#708): record a pending bulk action and return a preview summary. */
  async preview(adminId: string, actionType: string, targetIds: string[]) {
    if (!Array.isArray(targetIds) || targetIds.length === 0) {
      throw new BadRequestException('targetIds must be a non-empty array');
    }
    if (targetIds.length > MAX_TARGETS) {
      throw new BadRequestException(`A bulk action supports at most ${MAX_TARGETS} targets`);
    }

    const action = await this.actions.save(
      this.actions.create({
        adminId,
        actionType,
        targetIds,
        status: BulkActionStatus.PENDING_CONFIRMATION,
        affectedCount: targetIds.length,
      }),
    );

    return {
      bulkActionId: action.id,
      summary: `Will apply "${actionType}" to ${targetIds.length} target(s)`,
      count: targetIds.length,
      warnings: [] as string[],
    };
  }

  /** Step 2 (#708): confirm and mark a pending bulk action for processing. */
  async execute(bulkActionId: string) {
    const action = await this.actions.findOne({ where: { id: bulkActionId } });
    if (!action) throw new NotFoundException('Bulk action not found');

    if (action.status !== BulkActionStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('Bulk action is not awaiting confirmation');
    }
    if (Date.now() - action.createdAt.getTime() > CONFIRM_WINDOW_MS) {
      throw new BadRequestException('Confirmation window has expired');
    }

    action.status = BulkActionStatus.PROCESSING;
    action.confirmedAt = new Date();
    await this.actions.save(action);

    // Heavy processing (batched via BullMQ) is handled by the worker; this
    // marks the action confirmed and ready to process.
    return { bulkActionId: action.id, status: action.status };
  }

  /** Progress/status for a bulk action (#708). */
  async getStatus(bulkActionId: string) {
    const action = await this.actions.findOne({ where: { id: bulkActionId } });
    if (!action) throw new NotFoundException('Bulk action not found');
    const summary = action.resultSummary ?? {};
    return {
      processed: Number((summary as Record<string, unknown>).processed ?? 0),
      total: action.affectedCount,
      failed: Number((summary as Record<string, unknown>).failed ?? 0),
      status: action.status,
    };
  }
}
