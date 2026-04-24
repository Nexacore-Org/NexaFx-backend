import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, TapObserver } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { ApiKeyService } from '../services/api-key.service';
import type { Request } from 'express';
import type { Response } from 'express';

@Injectable()
export class ApiKeyUsageInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiKeyUsageInterceptor.name);

  constructor(private readonly apiKeyService: ApiKeyService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logUsage(request, response, startTime);
        },
        error: (error) => {
          const statusCode = error?.status || 500;
          this.logUsage(request, response, startTime, statusCode);
        },
      }),
    );
  }

  private logUsage(
    request: Request & { apiKey?: { apiKeyId: string } },
    response: Response,
    startTime: number,
    statusCodeOverride?: number,
  ): void {
    // Only log if request was authenticated via API key
    if (!request.apiKey) {
      return;
    }

    try {
      const latencyMs = Date.now() - startTime;
      const endpoint = `${request.method} ${request.path}`;
      const statusCode = statusCodeOverride || response.statusCode;

      this.apiKeyService.logUsage(
        request.apiKey.apiKeyId,
        endpoint,
        statusCode,
        latencyMs,
      );
    } catch (error) {
      // Don't throw error to prevent breaking main functionality
      this.logger.error(
        `Failed to log API key usage in interceptor: ${error.message}`,
        error.stack,
      );
    }
  }
}
