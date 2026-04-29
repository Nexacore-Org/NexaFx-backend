import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export interface GqlUser {
  userId: string;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GqlUser => {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext<{ req: { user: GqlUser } }>().req.user;
  },
);
