import {
  evaluateRateLimit,
  pruneRateLimitStore,
  rateLimitKey,
} from './rate-limit';

const rule = { limit: 3, windowMs: 1000 };

describe('evaluateRateLimit', () => {
  it('allows up to the limit and then blocks', () => {
    let hits: number[] = [];
    for (let attempt = 1; attempt <= rule.limit; attempt += 1) {
      const verdict = evaluateRateLimit(hits, 1000 + attempt, rule);
      expect(verdict.allowed).toBe(true);
      expect(verdict.remaining).toBe(rule.limit - attempt);
      hits = verdict.hits;
    }
    const blocked = evaluateRateLimit(hits, 1004, rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    // The oldest hit was at 1001, so the window frees up at 2001.
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it('does not record a hit for a rejected request', () => {
    const full = [1001, 1002, 1003];
    expect(evaluateRateLimit(full, 1004, rule).hits).toEqual(full);
  });

  /** The seam a fixed window has: 2x the budget across a boundary. */
  it('slides rather than resetting on a boundary', () => {
    const burst = [1900, 1950, 1999];
    expect(evaluateRateLimit(burst, 2000, rule).allowed).toBe(false);
    // Only after the oldest hit ages out does one slot open — not all three.
    const later = evaluateRateLimit(burst, 2901, rule);
    expect(later.allowed).toBe(true);
    expect(later.remaining).toBe(0);
  });

  it('drops hits that aged out of the window', () => {
    const verdict = evaluateRateLimit([1, 2, 3], 5000, rule);
    expect(verdict.allowed).toBe(true);
    expect(verdict.hits).toEqual([5000]);
  });

  it('reports at least one second of wait so Retry-After is never 0', () => {
    const verdict = evaluateRateLimit([1000, 1001, 1002], 1999.5, rule);
    expect(verdict.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe('rateLimitKey', () => {
  it('separates routes and callers', () => {
    expect(rateLimitKey(['AuthController', 'login', '10.0.0.1'])).not.toBe(
      rateLimitKey(['AuthController', 'register', '10.0.0.1']),
    );
    expect(rateLimitKey(['AuthController', 'login', '10.0.0.1'])).not.toBe(
      rateLimitKey(['AuthController', 'login', '10.0.0.2']),
    );
  });

  it('renders an unknown caller without collapsing into another key', () => {
    expect(rateLimitKey(['C', 'h', null])).toBe('C|h|-');
    expect(rateLimitKey(['C', 'h', undefined])).toBe('C|h|-');
  });
});

describe('pruneRateLimitStore', () => {
  it('deletes only keys whose newest hit aged out', () => {
    const store = new Map<string, number[]>([
      ['stale', [10, 20]],
      ['fresh', [10, 4500]],
      ['empty', []],
    ]);
    pruneRateLimitStore(store, 5000, 1000);
    expect([...store.keys()]).toEqual(['fresh']);
  });
});
