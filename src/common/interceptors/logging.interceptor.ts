import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { redact } from '../utils/redact.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // GraphQL carries its body in the variables, not on the HTTP request, and
    // switchToHttp() returns a context object that has no method/url.
    if (context.getType<string>() === 'graphql') {
      const gqlRequest = GqlExecutionContext.create(context).getContext<{
        req?: Record<string, unknown>;
      }>()?.req;
      if (gqlRequest) {
        this.logger.log(
          `[${this.requestId(gqlRequest)}] Incoming GraphQL operation`,
        );
      }
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const { method, url, body } = request;
    const userAgent = request.get('user-agent') || '';
    const startTime = Date.now();
    const requestId = this.requestId(request);

    this.logger.log(
      `[${requestId}] Incoming Request: ${method} ${url} - User Agent: ${userAgent}`,
    );

    if (body && Object.keys(body).length > 0) {
      // Redacted: this body carries passwords, OTPs, TOTP codes and refresh
      // tokens on the auth routes, and log readers are not the same audience
      // as the account owner.
      this.logger.debug(
        `[${requestId}] Request Body: ${JSON.stringify(redact(body))}`,
      );
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - startTime;
          this.logger.log(
            `[${requestId}] Outgoing Response: ${method} ${url} - ${responseTime}ms`,
          );
        },
        error: (error) => {
          const responseTime = Date.now() - startTime;
          this.logger.error(
            `[${requestId}] Error Response: ${method} ${url} - ${responseTime}ms - ${error.message}`,
          );
        },
      }),
    );
  }

  private requestId(request: Record<string, unknown>): string {
    const header = request.headers?.['x-request-id'];
    const value = Array.isArray(header) ? header[0] : header;
    return typeof value === 'string' && value.length > 0 ? value : 'unknown';
  }
}
