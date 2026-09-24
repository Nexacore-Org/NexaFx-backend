import { Module } from '@nestjs/common';
import { GraphqlSubscriptionsResolver } from './graphql-subscriptions.controller';
import { GraphqlSubscriptionsService } from './graphql-subscriptions.service';

@Module({
  providers: [GraphqlSubscriptionsResolver, GraphqlSubscriptionsService],
  exports: [GraphqlSubscriptionsService],
})
export class GraphqlSubscriptionsModule {}
