import { createHash } from 'node:crypto';
import {
  RefreshSession,
  SessionRevokeReason,
} from './entities/refresh-session.entity';

/** Refresh tokens live seven days; the session row expires with the JWT. */
export const REFRESH_TOKEN_DAYS = 7;

/**
 * A rotated token stays usable for this long. Two tabs refreshing at the same
 * moment both present the token the other just consumed; without the window
 * that innocent race looks exactly like a replay and would log the user out of
 * every device. The window is short enough that a stolen token is still caught.
 */
export const ROTATION_GRACE_MS = 30_000;

/** Tokens are stored hashed: a dump of `refresh_sessions` is not replayable. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshExpiry(now: Date, days = REFRESH_TOKEN_DAYS): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export type SessionState =
  /** Never used before — the normal path. */
  | 'active'
  /** Already rotated, but inside the grace window: a client race, not a theft. */
  | 'grace'
  /** Rotated long ago, or the hash does not match: treat as a stolen token. */
  | 'reuse'
  /** Deliberately revoked (logout, password change): a plain 401, no family kill. */
  | 'revoked'
  | 'expired';

/**
 * Classifies a presented refresh token. Pure so every branch — including the
 * replay branch that revokes a whole family — is unit-testable without a
 * database.
 *
 * Order matters: the hash is checked first because a mismatch means the caller
 * holds a token that was never this row's, which is a forgery regardless of
 * whether the row also happens to be expired.
 */
export function sessionState(
  session: Pick<
    RefreshSession,
    'tokenHash' | 'expiresAt' | 'revokedAt' | 'revokedReason'
  >,
  presentedHash: string,
  now: Date,
  graceMs: number = ROTATION_GRACE_MS,
): SessionState {
  if (session.tokenHash !== presentedHash) return 'reuse';
  if (session.revokedAt) {
    if (session.revokedReason !== SessionRevokeReason.ROTATED) return 'revoked';
    return now.getTime() - session.revokedAt.getTime() <= graceMs
      ? 'grace'
      : 'reuse';
  }
  if (session.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export type PublicSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  /** True for the session whose refresh token made this very request. */
  current: boolean;
};

/**
 * The session-list projection. Field-by-field on purpose: spreading the entity
 * would publish `tokenHash`, which is the one column that must never leave the
 * server even to the token's own owner.
 */
export function serializeSession(
  session: RefreshSession,
  currentSessionId: string | null,
): PublicSession {
  return {
    id: session.id,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    current: session.id === currentSessionId,
  };
}

/** Bounded so a hostile User-Agent cannot bloat the row or the session list. */
export function normalizeUserAgent(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 255);
  return trimmed || null;
}

/**
 * Takes the socket address, or the first hop of X-Forwarded-For when the app
 * sits behind Railway's proxy. Only the leftmost entry is meaningful; the rest
 * are proxy hops and any of them can be forged by the client.
 */
export function normalizeIp(
  socketAddress: unknown,
  forwardedFor?: string | string[],
): string | null {
  const forwarded = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor;
  const candidate =
    typeof forwarded === 'string' && forwarded.trim()
      ? forwarded.split(',')[0]
      : socketAddress;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim().slice(0, 45);
  return trimmed || null;
}
