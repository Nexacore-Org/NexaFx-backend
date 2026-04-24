import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiKeyService } from '../services/api-key.service';
import {
  SKIP_API_KEY_AUTH_KEY,
  SkipApiKeyAuth,
} from '../decorators/skip-api-key-auth.decorator';
import { REQUIRE_SCOPES_KEY } from '../decorators/require-scopes.decorator';

export interface ApiKeyPayload {
  apiKeyId: string;
  name: string;
  scopes: string[];
  prefix: string;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { apiKey: ApiKeyPayload }>();

    // Check if route skips API key auth
    const skipApiKeyAuth = this.reflector.getAllAndOverride<boolean>(
      SKIP_API_KEY_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipApiKeyAuth) {
      return true;
    }

    // Extract API key from header
    const apiKey = request.headers['x-api-key'] as string;

    // If no API key provided, allow request to pass (JWT auth may handle it)
    if (!apiKey) {
      return true;
    }

    try {
      // Validate the API key
      const validatedKey = await this.apiKeyService.validateKey(apiKey);

      // Attach API key metadata to request
      request.apiKey = {
        apiKeyId: validatedKey.id,
        name: validatedKey.name,
        scopes: validatedKey.scopes,
        prefix: validatedKey.prefix,
      };

      // Check scope permissions
      const requiredScopes = this.reflector.getAllAndOverride<string[]>(
        REQUIRE_SCOPES_KEY,
        [context.getHandler(), context.getClass()],
      );

      if (requiredScopes && requiredScopes.length > 0) {
        this.validateScopes(validatedKey.scopes, requiredScopes);
      }

      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      this.logger.error(`API key validation failed: ${error.message}`);
      throw new UnauthorizedException('Invalid API key');
    }
  }

  /**
   * Validate that the API key has the required scopes
   * Supports hierarchical scopes (e.g., 'admin:*' matches 'admin:read')
   */
  private validateScopes(keyScopes: string[], requiredScopes: string[]): void {
    for (const requiredScope of requiredScopes) {
      const hasScope = keyScopes.some((keyScope) => {
        // Exact match
        if (keyScope === requiredScope) {
          return true;
        }

        // Wildcard match: 'admin:*' matches 'admin:read', 'admin:write', etc.
        if (keyScope.endsWith(':*')) {
          const prefix = keyScope.slice(0, -2); // Remove ':*'
          return requiredScope.startsWith(prefix + ':');
        }

        // Global wildcard: '*' matches everything
        if (keyScope === '*') {
          return true;
        }

        return false;
      });

      if (!hasScope) {
        throw new ForbiddenException(
          `API key does not have required scope: ${requiredScope}`,
        );
      }
    }
  }
}
