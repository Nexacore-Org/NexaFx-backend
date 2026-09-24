import { Resolver, Subscription, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GraphqlSubscriptionsService } from './graphql-subscriptions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver()
@UseGuards(JwtAuthGuard)
export class GraphqlSubscriptionsResolver {
  constructor(private readonly subscriptionsService: GraphqlSubscriptionsService) {}

  @Subscription(() => Object, {
    name: 'exchangeRateUpdated',
  })
  public exchangeRateUpdated(@Args('pair') pair: string) {
    return this.subscriptionsService.getExchangeRateStream(pair);
  }

  @Subscription(() => Object, {
    name: 'transactionStatusChanged',
  })
  public transactionStatusChanged(
    @Args('transactionId', { type: () => ID }) transactionId: string,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.getTransactionStream(transactionId, user.id);
  }
}