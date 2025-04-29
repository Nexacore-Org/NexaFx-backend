import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // if user is attached to request
    const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const action = request.route.path; 

    // this should Only log if user exists (authenticated)
    if (user?.id) {
      return next.handle().pipe(
        tap(() => {
          this.auditService.logAction(user.id, ip, action);
        }),
      );
    }

    return next.handle();
  }
}
