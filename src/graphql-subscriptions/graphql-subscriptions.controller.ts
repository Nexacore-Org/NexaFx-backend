import { Resolver, Subscription, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GraphqlSubscriptionsService, ExchangeRateUpdate, TransactionStatusUpdate } from './graphql-subscriptions.service';
import { GqlAuthGuard } from '../graphql/guards/gql-auth.guard'; // Reusing existing guard
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver()
@UseGuards(GqlAuthGuard)
export class GraphqlSubscriptionsResolver {
  constructor(private readonly subscriptionsService: GraphqlSubscriptionsService) {}

  @Subscription(() => ExchangeRateUpdate, {
    name: 'exchangeRateUpdated',
  })
  public exchangeRateUpdated(@Args('pair') pair: string) {
    return this.subscriptionsService.getExchangeRateStream(pair);
  }

  @Subscription(() => TransactionStatusUpdate, {
    name: 'transactionStatusChanged',
  })
  public transactionStatusChanged(
    @Args('transactionId', { type: () => ID }) transactionId: string,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.getTransactionStream(transactionId, user.id);
  }
}