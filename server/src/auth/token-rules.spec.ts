import { AuthTokenPurpose } from './entities/auth-token.entity';
import { hashRefreshToken } from './session-rules';
import {
  authTokenExpiry,
  authTokenState,
  buildDelivery,
  EMAIL_VERIFICATION_TTL_MS,
  hashAuthToken,
  isEmailVerified,
  maskEmail,
  PASSWORD_RESET_TTL_MS,
  redactDelivery,
  secondsUntilExpiry,
  tokenTtlMs,
} from './token-rules';
import type { AuthToken } from './entities/auth-token.entity';
import type { User } from '../users/entities/user.entity';

const now = new Date('2026-07-26T10:00:00.000Z');

function token(
  overrides: Partial<Pick<AuthToken, 'expiresAt' | 'consumedAt'>> = {},
) {
  return {
    expiresAt: new Date('2026-07-26T11:00:00.000Z'),
    consumedAt: null,
    ...overrides,
  };
}

describe('hashAuthToken', () => {
  it('shares the refresh-token hashing convention', () => {
    expect(hashAuthToken('abc')).toBe(hashRefreshToken('abc'));
  });

  it('is deterministic and never returns the token itself', () => {
    expect(hashAuthToken('abc')).toBe(hashAuthToken('abc'));
    expect(hashAuthToken('abc')).not.toBe('abc');
    expect(hashAuthToken('abc')).toHaveLength(64);
    expect(hashAuthToken('abc')).not.toBe(hashAuthToken('abd'));
  });

  /** varchar(64) in the schema: a longer digest would be silently truncated. */
  it('fits the column for inputs of any length', () => {
    expect(hashAuthToken('x'.repeat(4096))).toHaveLength(64);
  });
});

describe('tokenTtlMs', () => {
  it('gives a reset link one hour and a verification link a day', () => {
    expect(tokenTtlMs(AuthTokenPurpose.PASSWORD_RESET)).toBe(60 * 60 * 1000);
    expect(tokenTtlMs(AuthTokenPurpose.EMAIL_VERIFICATION)).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  /** The reset window must never widen to the verification window by accident. */
  it('keeps the reset window the shorter of the two', () => {
    expect(PASSWORD_RESET_TTL_MS).toBeLessThan(EMAIL_VERIFICATION_TTL_MS);
  });
});

describe('authTokenExpiry', () => {
  it('adds the purpose window in UTC', () => {
    expect(
      authTokenExpiry(now, AuthTokenPurpose.PASSWORD_RESET).toISOString(),
    ).toBe('2026-07-26T11:00:00.000Z');
    expect(
      authTokenExpiry(now, AuthTokenPurpose.EMAIL_VERIFICATION).toISOString(),
    ).toBe('2026-07-27T10:00:00.000Z');
  });

  it('does not mutate the clock it was handed', () => {
    const reference = new Date(now);
    authTokenExpiry(reference, AuthTokenPurpose.PASSWORD_RESET);
    expect(reference.toISOString()).toBe(now.toISOString());
  });
});

describe('authTokenState', () => {
  it('accepts an unspent token inside its window', () => {
    expect(authTokenState(token(), now)).toBe('active');
  });

  it('rejects a token at the exact instant it expires', () => {
    expect(authTokenState(token({ expiresAt: now }), now)).toBe('expired');
  });

  it('still accepts a token one millisecond before expiry', () => {
    expect(
      authTokenState(token({ expiresAt: new Date(now.getTime() + 1) }), now),
    ).toBe('active');
  });

  it('rejects a redeemed token — single use is the whole contract', () => {
    expect(authTokenState(token({ consumedAt: now }), now)).toBe('consumed');
  });

  /**
   * A superseded token is stamped consumed, so asking for a second reset email
   * must retire the first link even though its hour has not run out.
   */
  it('reports a consumed-but-unexpired token as consumed', () => {
    expect(
      authTokenState(
        token({
          consumedAt: new Date('2026-07-26T10:30:00.000Z'),
          expiresAt: new Date('2026-07-26T11:00:00.000Z'),
        }),
        new Date('2026-07-26T10:45:00.000Z'),
      ),
    ).toBe('consumed');
  });

  it('keeps calling a token consumed after its window also closes', () => {
    expect(
      authTokenState(
        token({
          consumedAt: new Date('2026-07-26T10:30:00.000Z'),
          expiresAt: new Date('2026-07-26T11:00:00.000Z'),
        }),
        new Date('2026-07-26T23:00:00.000Z'),
      ),
    ).toBe('consumed');
  });
});

describe('isEmailVerified', () => {
  it('reports a stamped account as verified', () => {
    expect(isEmailVerified({ emailVerifiedAt: now })).toBe(true);
  });

  it('reports an unstamped account as unverified', () => {
    expect(isEmailVerified({ emailVerifiedAt: null })).toBe(false);
  });

  /**
   * A freshly built entity has never been read back from MySQL, so the column
   * is undefined rather than null. A `!== null` check would call that verified.
   */
  it('treats an in-memory entity that was never persisted as unverified', () => {
    expect(
      isEmailVerified({ emailVerifiedAt: undefined } as unknown as User),
    ).toBe(false);
  });
});

describe('secondsUntilExpiry', () => {
  it('floors to whole seconds', () => {
    expect(secondsUntilExpiry(new Date(now.getTime() + 1999), now)).toBe(1);
  });

  it('never goes negative for a token that is already dead', () => {
    expect(secondsUntilExpiry(new Date(now.getTime() - 60_000), now)).toBe(0);
  });
});

describe('maskEmail', () => {
  it('keeps the domain and the first and last local characters', () => {
    expect(maskEmail('customer@example.com')).toBe('c***r@example.com');
  });

  it('does not expose a short local part', () => {
    expect(maskEmail('ab@example.com')).toBe('a***@example.com');
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });

  it('refuses to echo something that is not an address', () => {
    expect(maskEmail('not-an-address')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
  });
});

describe('redactDelivery', () => {
  const delivery = buildDelivery(
    'customer@example.com',
    AuthTokenPurpose.PASSWORD_RESET,
    'super-secret-token',
    new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
    now,
  );

  it('carries the secret and its remaining life to a transport', () => {
    expect(delivery.token).toBe('super-secret-token');
    expect(delivery.ttlSeconds).toBe(3600);
  });

  it('never publishes the token or the raw address', () => {
    const redacted = redactDelivery(delivery);
    expect(redacted).not.toHaveProperty('token');
    expect(JSON.stringify(redacted)).not.toContain('super-secret-token');
    expect(redacted.to).toBe('c***r@example.com');
  });

  it('keeps enough to audit that a token was minted', () => {
    const redacted = redactDelivery(delivery);
    expect(redacted.purpose).toBe(AuthTokenPurpose.PASSWORD_RESET);
    expect(redacted.expiresAt).toEqual(delivery.expiresAt);
  });
});
