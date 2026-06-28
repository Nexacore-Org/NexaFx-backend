import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';

export interface CurrentUserPayload {
  userId: string;
  email: string;
  role: string;
  authStage?: string;
  isImpersonation?: boolean;
  impersonatedBy?: string;
  jti?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: CurrentUserPayload }>();
    return request.user;
  },
);
