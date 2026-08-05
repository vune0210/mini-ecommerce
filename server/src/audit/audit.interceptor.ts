import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUser } from '../auth/auth.types';
import { normalizeIp } from '../auth/session-rules';
import { ensureRequestId } from '../common/http/request-context';
import { UserRole } from '../users/entities/user.entity';
import {
  auditMetadata,
  deriveAction,
  deriveResourceType,
  isMutatingMethod,
  resolveRoute,
  shouldAudit,
} from './audit-rules';
import { AuditService } from './audit.service';

/**
 * Structural rather than express's `Request`: `req.route` is typed `any` there,
 * which would make every read off it an unsafe access. Same approach the rate
 * limit guard takes.
 */
type AuditedRequest = {
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  user?: AuthenticatedUser;
  requestId?: string;
  /** Express's matched route pattern, e.g. '/api/admin/products/:id'. */
  route?: { path?: string };
};

/** Column width; the trail records which route was hit, not a full URL archive. */
const MAX_PATH = 512;

/**
 * Writes one row per successful admin mutation. Registered globally from
 * AppModule so a new admin endpoint is covered the day it is added — an audit
 * trail each controller has to opt into is an audit trail with holes in it.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<AuditedRequest>();
    const method = request.method ?? '';
    const user = request.user;
    // Cheap pre-filter: everything decidable before the handler runs is decided
    // here, so a customer's checkout never pays for reading its own body.
    if (user?.role !== UserRole.ADMIN || !isMutatingMethod(method))
      return next.handle();

    // Snapshotted before the handler runs: a service is free to mutate the DTO
    // it was handed, and the row must describe what was asked for.
    const metadata = auditMetadata(request.body);

    return next.handle().pipe(
      tap({
        next: () => {
          const response = http.getResponse<{ statusCode?: number }>();
          this.record(request, user, response.statusCode ?? 200, metadata);
        },
        // No error branch: a failed request is not an action taken, and the
        // exception filter already records the failure.
      }),
    );
  }

  private record(
    request: AuditedRequest,
    user: AuthenticatedUser,
    statusCode: number,
    metadata: Record<string, unknown> | null,
  ): void {
    try {
      const method = request.method ?? '';
      if (!shouldAudit({ method, statusCode, role: user.role })) return;

      const url = request.originalUrl ?? request.url ?? '';
      const route = resolveRoute(request.route?.path, url);
      // Fire and forget. Awaiting would put a database round trip on the
      // response path of every admin mutation, and a slow or unavailable audit
      // table must never hold up — or fail — the request it is observing. The
      // trade-off is that a crash between response and insert loses one row.
      void this.audit
        .record({
          actorUserId: user.id,
          // Snapshots: readable after the account is deleted and the FK nulls.
          actorEmail: user.email,
          actorRole: user.role,
          action: deriveAction(method, route.segments),
          method: method.toUpperCase(),
          path: url.slice(0, MAX_PATH),
          resourceType: deriveResourceType(route.segments),
          resourceId: route.resourceId,
          statusCode,
          // Idempotent: LoggingInterceptor has already minted it, so the row
          // and the access-log line for this request share one id.
          requestId: ensureRequestId(request),
          metadata,
          ipAddress: normalizeIp(
            request.ip ?? request.socket?.remoteAddress,
            request.headers?.['x-forwarded-for'],
          ),
        })
        .catch((error: unknown) => this.warn(error));
    } catch (error) {
      this.warn(error);
    }
  }

  /** Warn, never throw: the response has already been produced. */
  private warn(error: unknown): void {
    this.logger.warn({
      message: 'audit log write failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
