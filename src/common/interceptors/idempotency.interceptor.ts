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
import { catchError, switchMap, concatMap, map } from 'rxjs/operators';
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
      this.idempotencyService.beginIdempotency(
        idempotencyKey,
        userId,
        request.body,
        endpoint,
      ),
    ).pipe(
      switchMap((result) => {
        if (result.state === 'replay') {
          response.setHeader('Idempotency-Key', idempotencyKey);
          response.setHeader('X-Idempotency-Replayed', 'true');
          response.status(result.statusCode);
          return of(result.body);
        }

        return next.handle().pipe(
          concatMap((responseData) =>
            from(
              this.idempotencyService.storeIdempotency(
                idempotencyKey,
                userId,
                endpoint,
                response.statusCode,
                responseData,
                request.body,
              ),
            ).pipe(
              catchError((err) =>
                throwError(() => err),
              ),
              map(() => {
                response.setHeader('Idempotency-Key', idempotencyKey);
                return responseData;
              }),
            ),
          ),
          catchError((error) =>
            from(
              this.idempotencyService.releaseIdempotency(idempotencyKey, userId),
            ).pipe(
              catchError(() => of(null)),
              switchMap(() => throwError(() => error)),
            ),
          ),
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
          error?.getStatus?.() === HttpStatus.UNPROCESSABLE_ENTITY ||
          error['status'] === HttpStatus.UNPROCESSABLE_ENTITY
        ) {
          return throwError(() => error);
        }
        if (
          error?.getStatus?.() === HttpStatus.CONFLICT ||
          error['status'] === HttpStatus.CONFLICT
        ) {
          return throwError(() => error);
        }
        if (error?.getStatus?.() === HttpStatus.BAD_REQUEST || error['status'] === HttpStatus.BAD_REQUEST) {
          return throwError(() => error);
        }
        return throwError(() => error);
      }),
    );
  }
}
