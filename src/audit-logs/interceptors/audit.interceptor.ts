import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogsService } from '../audit-logs.service';
import { Reflector } from '@nestjs/core';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const action = this.reflector.get<string>('audit:action', context.getHandler());
    const entity = this.reflector.get<string>('audit:entity', context.getHandler());

    if (!action || !entity) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (response) => {
        try {
          await this.auditLogsService.createLog({
            userId: user?.id,
            action,
            entity: entity as any,
            entityId: response?.id || request.params?.id,
            metadata: {
              method: request.method,
              url: request.url,
              statusCode: context.switchToHttp().getResponse().statusCode,
              body: this.sanitizeBody(request.body),
            },
          });
        } catch (error) {
          // Don't throw error to prevent breaking the main request
          console.error('Failed to log audit:', error);
        }
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;
    
    const sanitized = { ...body };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'privateKey', 'pin'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
}