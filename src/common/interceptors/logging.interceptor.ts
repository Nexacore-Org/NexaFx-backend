import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body } = request;
    const userAgent = request.get('user-agent') || '';
    const startTime = Date.now();
    const requestId = request.headers['x-request-id'] || 'unknown';

    this.logger.log(
      `[${requestId}] Incoming Request: ${method} ${url} - User Agent: ${userAgent}`,
    );

    if (body && Object.keys(body).length > 0) {
      this.logger.debug(
        `[${requestId}] Request Body: ${JSON.stringify(body)}`,
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
}
