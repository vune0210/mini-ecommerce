/**
 * Framework-free log shaping. Kept separate from the LoggerService so the
 * redaction and serialization rules can be unit tested without booting Nest.
 */

export type LogLevel =
  'debug' | 'verbose' | 'info' | 'warn' | 'error' | 'fatal';

const SENSITIVE_KEYS = [
  'password',
  'currentpassword',
  'newpassword',
  'accesstoken',
  'refreshtoken',
  'token',
  'authorization',
  'cookie',
  'setcookie',
  'secret',
  'dbpassword',
  'smtppassword',
  'adminpassword',
  'apikey',
  'clientsecret',
  'webhooksecret',
  'stripekey',
  'stripesignature',
  'accesskey',
  'secretaccesskey',
  'xapikey',
];

const MAX_DEPTH = 4;
export const REDACTED = '[redacted]';

/**
 * Masks credential-shaped keys anywhere in a structure. Depth-bounded because
 * a TypeORM entity graph is cyclic and arbitrarily deep.
 */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value))
    return value.map((item) => redactSecrets(item, depth + 1));
  if (typeof value === 'string') return redactTextSecrets(value);
  if (value === null || typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    result[key] = SENSITIVE_KEYS.includes(normalizedKey)
      ? REDACTED
      : redactSecrets(item, depth + 1);
  }
  return result;
}

/** Redacts credentials embedded in exception messages and connection URLs. */
export function redactTextSecrets(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(
      /\b([A-Za-z][A-Za-z0-9+.-]*:\/\/[^:\s/@]+):[^@\s/]+@/g,
      '$1:[redacted]@',
    )
    .replace(
      /\b(password|token|secret|api[_-]?key|client[_-]?secret|webhook[_-]?secret|access[_-]?key)=([^\s&]+)/gi,
      '$1=[redacted]',
    )
    .replace(/\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+\b/g, '[redacted-stripe-key]')
    .replace(/\bwhsec_[A-Za-z0-9]+\b/g, '[redacted-webhook-secret]');
}

/**
 * One JSON object per line. Never throws: a logger that crashes on a cyclic
 * payload would take down the request it was trying to explain.
 *
 * `redactSecrets` rebuilds the structure depth-first with a depth bound, so
 * whatever reaches JSON.stringify is already acyclic — no cycle guard is
 * needed here, and a WeakSet one would falsely flag shared (non-cyclic)
 * references. The try/catch stays for getters that throw and similar surprises.
 */
export function toLogLine(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(redactSecrets(record), (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
  } catch {
    return JSON.stringify({
      level: record.level ?? 'error',
      message: '[unserializable log record]',
    });
  }
}

/** Nest passes trailing args positionally: `[context]` or `[stack, context]`. */
export function splitNestArgs(args: unknown[]): {
  stack?: string;
  context?: string;
} {
  const strings = args.filter((arg): arg is string => typeof arg === 'string');
  if (strings.length === 0) return {};
  if (strings.length === 1) return { context: strings[0] };
  return { stack: strings[0], context: strings[strings.length - 1] };
}
