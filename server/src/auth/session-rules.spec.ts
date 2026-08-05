import { SessionRevokeReason } from './entities/refresh-session.entity';
import {
  hashRefreshToken,
  normalizeIp,
  normalizeUserAgent,
  refreshExpiry,
  ROTATION_GRACE_MS,
  serializeSession,
  sessionState,
} from './session-rules';
import type { RefreshSession } from './entities/refresh-session.entity';

const now = new Date('2026-07-26T10:00:00.000Z');
const hash = hashRefreshToken('token');

function session(
  overrides: Partial<
    Pick<
      RefreshSession,
      'tokenHash' | 'expiresAt' | 'revokedAt' | 'revokedReason'
    >
  > = {},
) {
  return {
    tokenHash: hash,
    expiresAt: new Date('2026-08-02T10:00:00.000Z'),
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  };
}

describe('hashRefreshToken', () => {
  it('is deterministic and never returns the token itself', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
    expect(hashRefreshToken('abc')).not.toBe('abc');
    expect(hashRefreshToken('abc')).toHaveLength(64);
    expect(hashRefreshToken('abc')).not.toBe(hashRefreshToken('abd'));
  });
});

describe('sessionState', () => {
  it('accepts an untouched, unexpired session', () => {
    expect(sessionState(session(), hash, now)).toBe('active');
  });

  it('treats a hash mismatch as a replay even when the row looks healthy', () => {
    expect(sessionState(session(), hashRefreshToken('other'), now)).toBe(
      'reuse',
    );
  });

  it('expires a session whose window has closed', () => {
    expect(
      sessionState(
        session({ expiresAt: new Date('2026-07-26T09:59:59.999Z') }),
        hash,
        now,
      ),
    ).toBe('expired');
  });

  it('allows a rotated token inside the grace window', () => {
    const rotated = session({
      revokedAt: new Date(now.getTime() - ROTATION_GRACE_MS + 1),
      revokedReason: SessionRevokeReason.ROTATED,
    });
    expect(sessionState(rotated, hash, now)).toBe('grace');
  });

  it('calls a rotated token past the grace window a replay', () => {
    const rotated = session({
      revokedAt: new Date(now.getTime() - ROTATION_GRACE_MS - 1),
      revokedReason: SessionRevokeReason.ROTATED,
    });
    expect(sessionState(rotated, hash, now)).toBe('reuse');
  });

  /** A logout must not look like a breach: it revokes one session, not a family. */
  it.each([
    SessionRevokeReason.LOGOUT,
    SessionRevokeReason.LOGOUT_ALL,
    SessionRevokeReason.PASSWORD_CHANGED,
    SessionRevokeReason.ACCOUNT_DISABLED,
  ])('reports %s as a plain revocation', (reason) => {
    expect(
      sessionState(
        session({ revokedAt: now, revokedReason: reason }),
        hash,
        now,
      ),
    ).toBe('revoked');
  });
});

describe('refreshExpiry', () => {
  it('adds whole days in UTC', () => {
    expect(refreshExpiry(now).toISOString()).toBe('2026-08-02T10:00:00.000Z');
  });
});

describe('serializeSession', () => {
  const row = {
    id: 'session-1',
    userId: 'user-1',
    familyId: 'family-1',
    tokenHash: hash,
    userAgent: 'Firefox',
    ipAddress: '10.0.0.1',
    expiresAt: now,
    revokedAt: null,
    revokedReason: null,
    replacedById: null,
    lastUsedAt: null,
    createdAt: now,
  } as RefreshSession;

  it('never publishes the token hash', () => {
    const projection = serializeSession(row, 'session-1');
    expect(projection).not.toHaveProperty('tokenHash');
    expect(projection).not.toHaveProperty('userId');
    expect(projection.current).toBe(true);
  });

  it('flags only the caller session as current', () => {
    expect(serializeSession(row, 'session-2').current).toBe(false);
    expect(serializeSession(row, null).current).toBe(false);
  });
});

describe('normalizeUserAgent', () => {
  it('bounds the length and collapses blanks to null', () => {
    expect(normalizeUserAgent('  Chrome  ')).toBe('Chrome');
    expect(normalizeUserAgent('   ')).toBeNull();
    expect(normalizeUserAgent(undefined)).toBeNull();
    expect(normalizeUserAgent('x'.repeat(300))).toHaveLength(255);
  });
});

describe('normalizeIp', () => {
  it('prefers the leftmost forwarded hop', () => {
    expect(normalizeIp('10.0.0.9', '203.0.113.7, 70.41.3.18')).toBe(
      '203.0.113.7',
    );
  });

  it('falls back to the socket address when no proxy header is present', () => {
    expect(normalizeIp('10.0.0.9', undefined)).toBe('10.0.0.9');
    expect(normalizeIp('10.0.0.9', '   ')).toBe('10.0.0.9');
  });

  it('returns null when nothing usable is available', () => {
    expect(normalizeIp(undefined, undefined)).toBeNull();
  });
});
