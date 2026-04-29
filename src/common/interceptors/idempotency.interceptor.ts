import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { IdempotencyService } from '../services/idempotency.service';
import { ConflictException } from '@nestjs/common';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['idempotency-key'];
    const userId = request.user?.id; // Assuming auth guard sets request.user

    // If no idempotency key or no user, proceed normally (should be enforced by guards)
    if (!idempotencyKey || !userId) {
      return next.handle();
    }

    // Check if we have a stored response for this key and user
    return this.idempotencyService
      .checkIdempotency(idempotencyKey, userId, request.body)
      .pipe(
        switchMap((cachedResponse) => {
          if (cachedResponse) {
            // Return cached response, skipping service logic
            return of(cachedResponse.body).pipe(
              tap((body) => {
                const response = context.switchToHttp().getResponse();
                response.status(cachedResponse.statusCode).json(body);
              })
            );
          }

          // No cached response, proceed to call the handler
          return next.handle().pipe(
            tap((responseData) => {
              // Store the response for future idempotent requests
              const response = context.switchToHttp().getResponse();
              this.idempotencyService.storeIdempotency(
                idempotencyKey,
                userId,
                request.route?.path || request.url,
                request.body,
                response.statusCode,
                responseData,
              );
            }),
            catchError((error) => {
              // If the handler throws an error, we don't cache it
              // We only cache successful responses
              return throwError(() => error);
            })
          );
        }),
        catchError((error) => {
          // If checkIdempotency threw a conflict error, propagate it
          if (error['code'] === 'IDEMPOTENCY_KEY_CONFLICT') {
            return throwError(() => new ConflictException(error.message));
          }
          // For other errors, propagate them
          return throwError(() => error);
        })
      );
  }
}