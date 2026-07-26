import { randomUUID } from 'node:crypto';

export type RequestWithId = {
  requestId?: string;
  headers?: Record<string, string | string[] | undefined>;
};

const HEADER = 'x-request-id';
/** Bounded so a hostile header cannot bloat every log line for a request. */
const MAX_LENGTH = 64;
const SAFE = /^[A-Za-z0-9._-]+$/;

/**
 * Idempotent. The interceptor stamps the id on the happy path, but a guard can
 * reject before any interceptor runs, so the exception filter calls this too.
 */
export function ensureRequestId(request: RequestWithId): string {
  if (request.requestId) return request.requestId;

  const raw = request.headers?.[HEADER];
  const supplied = Array.isArray(raw) ? raw[0] : raw;
  const inherited =
    typeof supplied === 'string' &&
    supplied.length <= MAX_LENGTH &&
    SAFE.test(supplied)
      ? supplied
      : undefined;

  request.requestId = inherited ?? randomUUID();
  return request.requestId;
}

export const REQUEST_ID_HEADER = HEADER;
