import { SetMetadata } from '@nestjs/common';
import { RateLimitRule } from './rate-limit';

export const RATE_LIMIT_KEY = 'rate-limit';

/**
 * Marks a route (or a whole controller) as rate limited. Routes without the
 * decorator are not throttled at all, so the global guard stays free for the
 * catalogue reads that make up most of the traffic.
 */
export const RateLimit = (rule: RateLimitRule) =>
  SetMetadata(RATE_LIMIT_KEY, rule);
