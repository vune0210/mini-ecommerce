import { IdempotencyState } from './entities/idempotency-key.entity';
import {
  canonicalJson,
  hashRequest,
  IDEMPOTENCY_TTL_MS,
  idempotencyExpiry,
  idempotencyOutcome,
  normalizeIdempotencyKey,
} from './idempotency-rules';

const now = new Date('2026-07-26T10:00:00.000Z');

function record(
  overrides: Partial<{
    requestHash: string;
    state: IdempotencyState;
    expiresAt: Date;
  }> = {},
) {
  return {
    requestHash: hashRequest({ a: 1 }),
    state: IdempotencyState.COMPLETED,
    expiresAt: new Date('2026-07-27T10:00:00.000Z'),
    ...overrides,
  };
}

describe('normalizeIdempotencyKey', () => {
  it('accepts a plausible client key', () => {
    expect(normalizeIdempotencyKey('  checkout-2026-07-26-abc123 ')).toBe(
      'checkout-2026-07-26-abc123',
    );
  });

  it('takes the first value when the header is repeated', () => {
    expect(normalizeIdempotencyKey(['first-key-value', 'second'])).toBe(
      'first-key-value',
    );
  });

  /** Absent means "not requested", not "rejected" — clients predate the header. */
  it('returns null rather than throwing for a missing header', () => {
    expect(normalizeIdempotencyKey(undefined)).toBeNull();
    expect(normalizeIdempotencyKey(null)).toBeNull();
    expect(normalizeIdempotencyKey(42)).toBeNull();
  });

  it('rejects keys that could not live in the unique index', () => {
    expect(normalizeIdempotencyKey('short')).toBeNull();
    expect(normalizeIdempotencyKey('x'.repeat(129))).toBeNull();
    expect(normalizeIdempotencyKey('has spaces here')).toBeNull();
    expect(normalizeIdempotencyKey('drop/table;--')).toBeNull();
  });
});

describe('canonicalJson', () => {
  /** The whole point: key order must not decide whether a retry is a conflict. */
  it('is stable under key reordering at every depth', () => {
    expect(canonicalJson({ a: 1, b: { c: 2, d: 3 } })).toBe(
      canonicalJson({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('keeps array order significant', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('ignores undefined members, which JSON would drop anyway', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('handles primitives and null', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(3)).toBe('3');
  });
});

describe('hashRequest', () => {
  it('matches for equivalent payloads and differs for changed ones', () => {
    expect(hashRequest({ a: 1, b: 2 })).toBe(hashRequest({ b: 2, a: 1 }));
    expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
    expect(hashRequest({ a: 1 })).toHaveLength(64);
  });
});

describe('idempotencyExpiry', () => {
  it('adds the TTL', () => {
    expect(idempotencyExpiry(now).getTime() - now.getTime()).toBe(
      IDEMPOTENCY_TTL_MS,
    );
  });
});

describe('idempotencyOutcome', () => {
  const hash = hashRequest({ a: 1 });

  it('replays a finished request with the same body', () => {
    expect(idempotencyOutcome(record(), hash, now)).toBe('replay');
  });

  it('reports a concurrent duplicate as in-flight', () => {
    expect(
      idempotencyOutcome(
        record({ state: IdempotencyState.IN_FLIGHT }),
        hash,
        now,
      ),
    ).toBe('in-flight');
  });

  /** Replaying here would silently discard the second, different order. */
  it('refuses a key reused with a different body', () => {
    expect(idempotencyOutcome(record(), hashRequest({ a: 2 }), now)).toBe(
      'conflict',
    );
  });

  it('calls a body mismatch a conflict even while the first attempt runs', () => {
    expect(
      idempotencyOutcome(
        record({ state: IdempotencyState.IN_FLIGHT }),
        hashRequest({ a: 2 }),
        now,
      ),
    ).toBe('conflict');
  });

  it('expires on the boundary, not after it', () => {
    expect(idempotencyOutcome(record({ expiresAt: now }), hash, now)).toBe(
      'expired',
    );
    expect(
      idempotencyOutcome(
        record({ expiresAt: new Date(now.getTime() + 1) }),
        hash,
        now,
      ),
    ).toBe('replay');
  });
});
