import { Module } from '@nestjs/common';
import { GraphqlSubscriptionsController } from './graphql-subscriptions.controller';
import { GraphqlSubscriptionsService } from './graphql-subscriptions.service';

@Module({
  controllers: [GraphqlSubscriptionsController],
  providers: [GraphqlSubscriptionsService],
  exports: [GraphqlSubscriptionsService],
})
export class GraphqlSubscriptionsModule {}
