import { AuthToken, AuthTokenPurpose } from './entities/auth-token.entity';
import { hashRefreshToken } from './session-rules';
import { User } from '../users/entities/user.entity';

/**
 * A reset link is the strongest credential the system will ever put in an
 * inbox: whoever holds it owns the account. One hour is long enough for a
 * customer to switch to their mail client and short enough that a link left in
 * a shared or later-compromised mailbox has usually gone stale.
 */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Verification proves an address exists; holding the link grants nothing that
 * the account owner does not already have. It can afford a day, which is what
 * it takes to survive a mailbox that is only checked in the evening.
 */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function tokenTtlMs(purpose: AuthTokenPurpose): number {
  return purpose === AuthTokenPurpose.PASSWORD_RESET
    ? PASSWORD_RESET_TTL_MS
    : EMAIL_VERIFICATION_TTL_MS;
}

/**
 * Deliberately delegates to `hashRefreshToken` rather than calling `createHash`
 * again. There is exactly one hashing convention for bearer secrets in this
 * codebase; a second call site is a second thing to get wrong the day the
 * algorithm changes.
 */
export function hashAuthToken(token: string): string {
  return hashRefreshToken(token);
}

export function authTokenExpiry(now: Date, purpose: AuthTokenPurpose): Date {
  return new Date(now.getTime() + tokenTtlMs(purpose));
}

export type AuthTokenState =
  /** Unspent and inside its window — the only redeemable state. */
  | 'active'
  /** Redeemed, or superseded by a newer request for the same purpose. */
  | 'consumed'
  | 'expired';

/**
 * Classifies a token row that was already located by its hash. Pure, so every
 * branch is testable without a database — and so the single-use rule is a fact
 * about a function rather than a claim about a query.
 *
 * No hash comparison here (unlike `sessionState`): the row is *found by* its
 * unique `token_hash`, so a mismatch cannot reach this function.
 *
 * Consumption is checked before expiry because it is a fact we recorded, while
 * expiry is only derived from the clock. A token spent while still valid must
 * keep reporting `consumed` forever rather than quietly re-labelling itself
 * `expired` once an hour goes by; otherwise a replay after the window closes
 * would be indistinguishable from a link that was simply never clicked.
 */
export function authTokenState(
  token: Pick<AuthToken, 'expiresAt' | 'consumedAt'>,
  now: Date,
): AuthTokenState {
  if (token.consumedAt) return 'consumed';
  if (token.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

/**
 * The one place `email_verified_at` is turned into the boolean clients see.
 *
 * Truthiness rather than `!== null` on purpose: the column is `null` on a row
 * read back from MySQL but `undefined` on an entity that was only just built in
 * memory — as `AuthService.register` does — and `undefined !== null` would
 * report a brand-new, unverified account as verified.
 */
export function isEmailVerified(user: Pick<User, 'emailVerifiedAt'>): boolean {
  return Boolean(user.emailVerifiedAt);
}

/** Whole seconds of life left; never negative, so a caller cannot render "-3s". */
export function secondsUntilExpiry(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

/**
 * What a mail transport would be handed. This project has none, so the payload
 * is built anyway and then either logged (development) or reduced to an audit
 * line (production) — see `redactDelivery`.
 */
export type AuthTokenDelivery = {
  to: string;
  purpose: AuthTokenPurpose;
  /** The single-use secret, in the clear. Never leaves a production process. */
  token: string;
  expiresAt: Date;
  ttlSeconds: number;
};

export function buildDelivery(
  email: string,
  purpose: AuthTokenPurpose,
  token: string,
  expiresAt: Date,
  now: Date,
): AuthTokenDelivery {
  return {
    to: email,
    purpose,
    token,
    expiresAt,
    ttlSeconds: secondsUntilExpiry(expiresAt, now),
  };
}

/**
 * Keeps the address recognisable to whoever is reading the log without printing
 * it: application logs are shipped to aggregators that far more people can read
 * than can read the database, and an address is personal data on its own.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  return `${local[0]}***${local[local.length - 1]}${domain}`;
}

export type RedactedDelivery = {
  to: string;
  purpose: AuthTokenPurpose;
  expiresAt: Date;
};

/**
 * The production-safe projection. Field-by-field on purpose: spreading the
 * delivery and deleting `token` would re-leak it the day someone adds a field,
 * and this object is the one that reaches the log sink.
 */
export function redactDelivery(delivery: AuthTokenDelivery): RedactedDelivery {
  return {
    to: maskEmail(delivery.to),
    purpose: delivery.purpose,
    expiresAt: delivery.expiresAt,
  };
}
