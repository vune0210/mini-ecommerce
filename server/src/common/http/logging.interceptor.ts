import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { ensureRequestId, REQUEST_ID_HEADER } from './request-context';

type MaybeAuthenticated = Request & {
  user?: { id?: string };
  requestId?: string;
};

/**
 * Stamps every response with its correlation id and emits one access-log record
 * per request. Errors are left to the exception filter — this only records that
 * the request ended, so a failure is not logged twice with two shapes.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<MaybeAuthenticated>();
    const response = http.getResponse<Response>();

    const requestId = ensureRequestId(request);
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const startedAt = Date.now();
    const record = (statusCode: number): void => {
      this.logger.log({
        requestId,
        method: request.method,
        path: request.originalUrl || request.url || '',
        statusCode,
        durationMs: Date.now() - startedAt,
        userId: request.user?.id,
        clientIp: request.ip,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        error: (error: unknown) =>
          record(error instanceof HttpException ? error.getStatus() : 500),
      }),
    );
  }
}
