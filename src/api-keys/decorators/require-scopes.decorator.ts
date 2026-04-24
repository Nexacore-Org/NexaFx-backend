import { SetMetadata } from '@nestjs/common';

export const REQUIRE_SCOPES_KEY = 'require_scopes';
export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(REQUIRE_SCOPES_KEY, scopes);
