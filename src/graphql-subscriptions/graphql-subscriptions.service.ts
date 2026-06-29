import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #492 - graphql-subscriptions.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #492.
 */
@Injectable()
export class GraphqlSubscriptionsService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #492 - scaffold stub for graphql-subscriptions'
    );
  }
}
