import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { TransactionsService } from '../../transactions/services/transaction.service';
import { TransactionStatus } from '../../transactions/entities/transaction.entity';
import { CurrentUser, GqlUser } from '../decorators/current-user.decorator';

@Resolver('Transaction')
export class TransactionResolver {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Query('transactions')
  async transactions(
    @CurrentUser() user: GqlUser,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
    @Args('status', { nullable: true }) status?: string,
  ) {
    const resolvedLimit = limit ?? 20;
    const resolvedOffset = offset ?? 0;
    const page =
      resolvedOffset > 0
        ? Math.floor(resolvedOffset / resolvedLimit) + 1
        : 1;

    return this.transactionsService.findAllByUser(user.userId, {
      limit: resolvedLimit,
      page,
      status: status as TransactionStatus | undefined,
    });
  }
}
