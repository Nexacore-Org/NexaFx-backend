import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { SessionsService } from '../../modules/sessions/sessions.service';

@Injectable()
export class SessionActivityInterceptor implements NestInterceptor {
  constructor(private readonly sessionsService: SessionsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user && user.userId && user.jti) {
      // Fire-and-forget background update so we do not block the request
      this.sessionsService.updateLastActive(user.userId, user.jti).catch(() => {
        // ignore errors so we don't break request lifecycle
      });
    }

    return next.handle();
  }
}
