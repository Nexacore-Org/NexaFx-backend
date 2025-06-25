import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { ScheduledTransfersService } from '../providers/transfers.service';
import {
  MAX_DAILY_LIMIT,
  MAX_TRANSACTION_LIMIT,
} from 'src/common/constants/transfer-limits';

@Injectable()
export class LimitsGuard implements CanActivate {
  constructor(private readonly transfersService: ScheduledTransfersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { amount } = request.body;
    const user = request.user;

    if (amount > MAX_TRANSACTION_LIMIT) {
      throw new ForbiddenException(
        `Exceeds per-transaction limit of ₦${MAX_TRANSACTION_LIMIT}`,
      );
    }

    const totalTransferredToday = await this.transfersService.getTodayTotal(
      user.id,
    );
    if (totalTransferredToday + amount > MAX_DAILY_LIMIT) {
      throw new ForbiddenException(
        `Exceeds daily transfer limit of ₦${MAX_DAILY_LIMIT}`,
      );
    }

    return true;
  }
}
