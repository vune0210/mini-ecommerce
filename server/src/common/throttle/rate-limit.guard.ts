import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { AuthenticatedUser } from '../../auth/auth.types';
import { normalizeIp } from '../../auth/session-rules';
import { RATE_LIMIT_KEY } from './rate-limit.decorator';
import {
  evaluateRateLimit,
  pruneRateLimitStore,
  rateLimitKey,
  RateLimitRule,
} from './rate-limit';

/** A sweep every N checks keeps pruning off the hot path but bounds the Map. */
const SWEEP_EVERY = 500;

type ThrottledRequest = {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  route?: { path?: string };
  method?: string;
};

/**
 * Registered globally so any handler carrying `@RateLimit()` is covered without
 * each module wiring a guard. Handlers without the decorator pass straight
 * through.
 *
 * The counters are per process. Behind more than one API replica each replica
 * enforces its own share of the budget — acceptable for the brute-force and
 * spam rails this protects, but it is not a distributed quota. Moving to one
 * would mean swapping this store for Redis, not changing the rules module.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly store = new Map<string, number[]>();
  private readonly maxWindowMs = { value: 0 };
  private readonly disabled: boolean;
  private checks = 0;

  constructor(
    private readonly reflector: Reflector,
    configService: ConfigService,
  ) {
    // Read once: the flag decides behaviour for the process lifetime, and
    // re-reading process.env on every request would put a lookup on the hot
    // path of every route in the application.
    this.disabled = configService.get<string>('RATE_LIMIT_DISABLED') === 'true';
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.disabled) return true;
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!rule) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<ThrottledRequest>();
    const now = Date.now();
    this.sweep(now, rule);

    // An authenticated caller is charged by account so that several users
    // behind one NAT do not share a budget; anonymous callers fall back to IP.
    const identity =
      request.user?.id ??
      normalizeIp(
        request.ip ?? request.socket?.remoteAddress,
        request.headers?.['x-forwarded-for'],
      );
    const key = rateLimitKey([
      context.getClass().name,
      context.getHandler().name,
      identity,
    ]);
    const verdict = evaluateRateLimit(this.store.get(key) ?? [], now, rule);
    this.store.set(key, verdict.hits);

    const response = http.getResponse<Response>();
    response.setHeader('X-RateLimit-Limit', String(rule.limit));
    response.setHeader('X-RateLimit-Remaining', String(verdict.remaining));
    if (verdict.allowed) return true;

    response.setHeader('Retry-After', String(verdict.retryAfterSeconds));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests, please try again later',
        retryAfterSeconds: verdict.retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private sweep(now: number, rule: RateLimitRule): void {
    this.maxWindowMs.value = Math.max(this.maxWindowMs.value, rule.windowMs);
    this.checks += 1;
    if (this.checks < SWEEP_EVERY) return;
    this.checks = 0;
    pruneRateLimitStore(this.store, now, this.maxWindowMs.value);
  }
}
