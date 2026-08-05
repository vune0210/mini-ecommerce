import { createHash } from 'node:crypto';
import {
  IdempotencyKey,
  IdempotencyState,
} from './entities/idempotency-key.entity';

/** A stored key stops being honoured after this long. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Bounded and charset-restricted: the value lands in a unique index. */
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Returns the normalized key, or null when the header is absent or unusable.
 * Null means "no idempotency requested" — the operation still runs, because
 * refusing a request for lacking an optional header would break every existing
 * client the day this shipped.
 */
export function normalizeIdempotencyKey(value: unknown): string | null {
  // Express hands back an array when a header is repeated. The cast is to
  // unknown[], not any[]: Array.isArray narrows to any[], which would let the
  // element flow into the string check untyped.
  const raw: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return KEY_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Canonical JSON: object keys sorted at every depth, so `{a:1,b:2}` and
 * `{b:2,a:1}` hash alike. Without that, a client that serializes its form in a
 * different order on the retry would be told its key was reused with a
 * different payload — a false conflict on a request that is genuinely identical.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    // undefined members are absent from JSON, so they must not affect the hash.
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

export function hashRequest(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export function idempotencyExpiry(
  now: Date,
  ttlMs: number = IDEMPOTENCY_TTL_MS,
): Date {
  return new Date(now.getTime() + ttlMs);
}

export type IdempotencyOutcome =
  /** Same key, same body, finished: hand back the stored response. */
  | 'replay'
  /** Same key, different body: the client reused a key it should not have. */
  | 'conflict'
  /** Same key, still running: a genuine double-submit arriving concurrently. */
  | 'in-flight'
  /** The row aged out; the key may be claimed again. */
  | 'expired';

/**
 * Classifies an existing row against the incoming request. Pure, so every
 * branch — including the conflict that must NOT replay someone's stale order —
 * is testable without a database.
 *
 * The hash is compared before the state: a mismatched body is a client bug
 * regardless of whether the first attempt has finished, and answering it with
 * "still running" would send the client back to retry the wrong thing.
 */
export function idempotencyOutcome(
  record: Pick<IdempotencyKey, 'requestHash' | 'state' | 'expiresAt'>,
  requestHash: string,
  now: Date,
): IdempotencyOutcome {
  if (record.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (record.requestHash !== requestHash) return 'conflict';
  return record.state === IdempotencyState.COMPLETED ? 'replay' : 'in-flight';
}
