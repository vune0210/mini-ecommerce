export type RateLimitRule = {
  /** Requests allowed inside the window. */
  limit: number;
  windowMs: number;
};

export type RateLimitVerdict = {
  allowed: boolean;
  /** Hits still available after this request; 0 once the window is full. */
  remaining: number;
  /** Whole seconds until the oldest hit falls out; 0 when allowed. */
  retryAfterSeconds: number;
  /** The pruned hit log to store back, with this request appended if allowed. */
  hits: number[];
};

/**
 * Sliding-window log. A fixed window lets a caller spend the whole budget in
 * the last instant of one window and the whole budget again in the first
 * instant of the next — double the intended rate across the boundary. Keeping
 * the timestamps costs `limit` numbers per key and has no such seam.
 *
 * Pure on purpose: the store lives in the guard, so every expiry and boundary
 * case here is testable without a clock or a request.
 */
export function evaluateRateLimit(
  previous: readonly number[],
  now: number,
  rule: RateLimitRule,
): RateLimitVerdict {
  const cutoff = now - rule.windowMs;
  const hits = previous.filter((hit) => hit > cutoff);
  if (hits.length >= rule.limit) {
    // hits[0] is the oldest survivor, so it is the first to fall out.
    const retryAfterMs = hits[0] + rule.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      hits,
    };
  }
  hits.push(now);
  return {
    allowed: true,
    remaining: rule.limit - hits.length,
    retryAfterSeconds: 0,
    hits,
  };
}

/**
 * Buckets are per route *and* per caller. Without the route segment a login
 * attempt would consume the register budget; without the caller segment one
 * abusive IP would lock everyone out.
 */
export function rateLimitKey(
  parts: ReadonlyArray<string | null | undefined>,
): string {
  return parts.map((part) => part ?? '-').join('|');
}

/**
 * Drops keys whose newest hit has aged out. Called on a sweep rather than per
 * request: an unbounded Map keyed by client IP is a memory leak that only
 * shows up under the traffic the limiter exists to survive.
 */
export function pruneRateLimitStore(
  store: Map<string, number[]>,
  now: number,
  maxWindowMs: number,
): void {
  const cutoff = now - maxWindowMs;
  for (const [key, hits] of store) {
    if (!hits.length || hits[hits.length - 1] <= cutoff) store.delete(key);
  }
}
