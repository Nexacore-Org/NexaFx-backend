import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { GraphqlSubscriptionsService } from './graphql-subscriptions.service';

/**
 * Stub controller for v2 feature: graphql-subscriptions (issue #492).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #492.
 */
@Controller('v2/graphql-subscriptions')
export class GraphqlSubscriptionsController {
  constructor(private readonly service: GraphqlSubscriptionsService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #492 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #492 - scaffold stub');
  }
}
