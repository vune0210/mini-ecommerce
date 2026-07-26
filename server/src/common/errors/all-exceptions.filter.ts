import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { QueryFailedError } from 'typeorm';
import { ensureRequestId } from '../http/request-context';
import {
  buildErrorEnvelope,
  ErrorEnvelope,
  mapDriverError,
} from './error-rules';

type MaybeAuthenticated = Request & {
  user?: { id?: string };
  requestId?: string;
};

/** Plain number, not HttpStatus — comparing a status number against the enum
 * trips @typescript-eslint/no-unsafe-enum-comparison. */
const SERVER_ERROR_FLOOR = 500;

/**
 * Without this, a QueryFailedError reaches the client as a 500 carrying table
 * and column names, and the check-then-insert races documented in the backend
 * audit surface as 500s instead of the 409 the service intended.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;

    const http = host.switchToHttp();
    const request = http.getRequest<MaybeAuthenticated>();
    const response = http.getResponse<Response>();

    const requestId = ensureRequestId(request);
    const path = request.originalUrl || request.url || '';
    const envelope = this.describe(exception, { path, requestId });

    this.report(exception, envelope, request);

    if (response.headersSent) return;
    response.status(envelope.statusCode).json(envelope);
  }

  private describe(
    exception: unknown,
    where: { path: string; requestId: string },
  ): ErrorEnvelope {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return buildErrorEnvelope({
        status,
        payload: exception.getResponse(),
        reason: reasonFor(status),
        timestamp,
        ...where,
      });
    }

    const driver =
      exception instanceof QueryFailedError
        ? mapDriverError(
            (exception as QueryFailedError & { code?: unknown }).code,
          )
        : null;

    if (driver) {
      return buildErrorEnvelope({
        status: driver.status,
        payload: driver.message,
        reason: reasonFor(driver.status),
        timestamp,
        ...where,
      });
    }

    // Nothing about an unexpected fault is safe to echo back.
    return buildErrorEnvelope({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      payload: 'Internal server error',
      reason: reasonFor(HttpStatus.INTERNAL_SERVER_ERROR),
      timestamp,
      ...where,
    });
  }

  /** 5xx keeps its stack; 4xx is a caller mistake and only worth one line. */
  private report(
    exception: unknown,
    envelope: ErrorEnvelope,
    request: MaybeAuthenticated,
  ): void {
    const detail = {
      requestId: envelope.requestId,
      method: request.method,
      path: envelope.path,
      statusCode: envelope.statusCode,
      userId: request.user?.id,
    };

    if (envelope.statusCode >= SERVER_ERROR_FLOOR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      const message =
        exception instanceof Error ? exception.message : String(exception);
      this.logger.error({ ...detail, message }, stack);
      return;
    }

    this.logger.warn({ ...detail, message: envelope.message });
  }
}

function reasonFor(status: number): string {
  return STATUS_CODES[status] ?? 'Error';
}
