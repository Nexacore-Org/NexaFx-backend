import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from 'src/audit/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor() {}

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, ip, user } = request;

    const userId = user?.id || null;

    return next.handle().pipe(
      tap(() => {
        ({
          path: originalUrl,
          method,
          userId,
          ipAddress: ip,
        });
      }),
    );
  }
}
