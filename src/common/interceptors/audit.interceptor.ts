import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { UsersService } from '../../users/users.service';
import { AUDIT_ACTION_KEY } from '../decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogsService: AuditLogsService,
    private readonly usersService: UsersService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const action = this.reflector.get<string>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    if (!action) {
      return next.handle();
    }

    // Resolve resourceType (e.g. 'user.login' -> 'user', 'kyc.submission' -> 'kyc')
    let resourceType = action.split('.')[0] || 'system';
    if (resourceType === 'admin') {
      resourceType = 'user'; // admin actions (e.g. suspend user, change role) target user resource
    }

    // Resolve actorId
    let actorId = request.user?.userId || request.user?.id || null;
    if (!actorId && request.body?.email) {
      try {
        const user = await this.usersService.findByEmail(request.body.email);
        if (user) {
          actorId = user.id;
        }
      } catch {
        // Safe check ignore
      }
    }

    const sanitizeBody = (body: any): any => {
      if (!body) return body;
      const sanitized = { ...body };
      const sensitiveFields = ['password', 'token', 'secret', 'privateKey', 'pin', 'totpCode', 'otp'];
      sensitiveFields.forEach((field) => {
        if (sanitized[field]) {
          sanitized[field] = '[REDACTED]';
        }
      });
      return sanitized;
    };

    return next.handle().pipe(
      tap({
        next: async (response) => {
          let finalAction = action;
          // Resolve dynamic action name for KYC review
          if (action === 'kyc.review') {
            const decision = request.body?.status || request.body?.decision || response?.status;
            if (decision === 'approved' || decision === 'APPROVED' || decision === 'APPROVE') {
              finalAction = 'kyc.approved';
            } else if (decision === 'rejected' || decision === 'REJECTED' || decision === 'REJECT') {
              finalAction = 'kyc.rejected';
            }
          }

          // Resolve resourceId
          let resourceId = response?.id || response?.user?.id || request.params?.id || null;

          const metadata = {
            method: request.method,
            url: encodeURI(String(request.url ?? '')),
            statusCode: context.switchToHttp().getResponse().statusCode,
            body: sanitizeBody(request.body),
          };

          // Asynchronously write audit log (without blocking request execution)
          this.auditLogsService.log(
            actorId,
            finalAction,
            resourceType,
            resourceId,
            'SUCCESS',
            metadata,
            request,
          ).catch(() => {});
        },
        error: async (err) => {
          const metadata = {
            method: request.method,
            url: encodeURI(String(request.url ?? '')),
            statusCode: err.status || 500,
            body: sanitizeBody(request.body),
            error: err.message,
          };

          const resourceId = request.params?.id || null;

          this.auditLogsService.log(
            actorId,
            action,
            resourceType,
            resourceId,
            'FAILURE',
            metadata,
            request,
          ).catch(() => {});
        },
      }),
    );
  }
}
