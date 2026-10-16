import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, switchMap, tap, map } from 'rxjs/operators';
import { IdempotencyService } from '../services/idempotency.service';

import { MANDATORY_ENDPOINT_PATTERNS } from './idempotency-patterns';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  private isMandatoryEndpoint(url: string): boolean {
    return MANDATORY_ENDPOINT_PATTERNS.some((pattern) => pattern.test(url));
  }

  private getEndpointFingerprint(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest();
    return `${request.method} ${request.route?.path || request.url}`;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const idempotencyKey = request.headers['idempotency-key'];
    // JwtStrategy populates userId, not id: reading .id left userId
    // undefined, which short-circuited the whole replay path below.
    const userId = request.user?.userId ?? request.user?.id;
    const method = request.method;
    const url = request.url;

    const endpoint = this.getEndpointFingerprint(context);
    const isMutatingMethod = ['POST', 'PATCH', 'DELETE'].includes(method);
    const isMandatory = this.isMandatoryEndpoint(request.route?.path || url);

    if (isMandatory && !idempotencyKey) {
      return throwError(
        () =>
          new UnprocessableEntityException(
            'Idempotency-Key header is required for this endpoint',
          ),
      );
    }

    if (idempotencyKey) {
      const validation =
        this.idempotencyService.validateIdempotencyKey(idempotencyKey);
      if (!validation.valid) {
        return throwError(() => new BadRequestException(validation.error));
      }
    }

    if (!idempotencyKey || !userId || !isMutatingMethod) {
      response.setHeader('Idempotency-Key', idempotencyKey || '');
      return next.handle();
    }

    return from(
      this.idempotencyService.checkIdempotency(
        idempotencyKey,
        userId,
        request.body,
        endpoint,
      ),
    ).pipe(
      switchMap((cachedResponse) => {
        if (cachedResponse) {
          response.setHeader('Idempotency-Key', idempotencyKey);
          if (cachedResponse.replayed) {
            response.setHeader('X-Idempotency-Replayed', 'true');
          }
          return of(cachedResponse.body).pipe(
            map((body) => {
              response.status(cachedResponse.statusCode);
              return body;
            }),
          );
        }

        return next.handle().pipe(
          tap((responseData) => {
            this.idempotencyService.storeIdempotency(
              idempotencyKey,
              userId,
              endpoint,
              response.statusCode,
              responseData,
              request.body,
            );
          }),
          map((responseData) => {
            response.setHeader('Idempotency-Key', idempotencyKey);
            return responseData;
          }),
          catchError((error) => throwError(() => error)),
        );
      }),
      catchError((error) => {
        if (error['code'] === 'IDEMPOTENCY_KEY_CONFLICT') {
          return throwError(() => {
            const conflictError: any = new ConflictException(error.message);
            conflictError.code = 'IDEMPOTENCY_KEY_CONFLICT';
            return conflictError;
          });
        }
        if (
          error['code'] === 'IDEMPOTENCY_KEY_BODY_MISMATCH' ||
          error['status'] === HttpStatus.UNPROCESSABLE_ENTITY
        ) {
          return throwError(() => new UnprocessableEntityException(error.message));
        }
        if (error['status'] === HttpStatus.BAD_REQUEST) {
          return throwError(() => new BadRequestException(error.message));
        }
        return throwError(() => error);
      }),
    );
  }
}
