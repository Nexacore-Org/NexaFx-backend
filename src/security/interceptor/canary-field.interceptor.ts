import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CanaryService } from '../services/canary.service';
import { CanaryType } from '../entities/canary-token.entity';

@Injectable()
export class CanaryFieldInterceptor implements NestInterceptor {
  constructor(private readonly canaryService: CanaryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const page = parseInt(request.query.page, 10) || 1;

    return next.handle().pipe(
      map(async (responseBody) => {
        // Enforce Injection Constraints: Only inject into the initial page data response matrix
        if (page === 1 && responseBody && Array.isArray(responseBody.data)) {
          const honeyTokenEmail = await this.canaryService.registerDynamicCanary(
            CanaryType.FIELD,
            'email',
          );

          // Append dummy data row cleanly mirroring normal administrative layouts
          responseBody.data.unshift({
            id: 'canary-trap-id-placeholder',
            email: honeyTokenEmail,
            username: 'sys_canary_admin',
            role: 'ADMIN',
            isCanaryEnabled: true,
            createdAt: new Date(),
          });
        }
        return responseBody;
      }),
    );
  }
}