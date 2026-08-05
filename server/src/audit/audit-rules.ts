import { redactSecrets } from '../common/logging/log-rules';
import { UserRole } from '../users/entities/user.entity';

/**
 * Framework-free audit rules. Kept apart from the interceptor so "is this
 * auditable", "what is this action called" and "what may be kept from the body"
 * can be unit tested without an HTTP context or a database.
 */

/** Only state-changing verbs earn a row; a GET changes nothing to answer for. */
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

/**
 * 2xx and 3xx only. A rejected request is not an action taken — recording a
 * failed attempt as `product.delete` would put a deletion in the trail that
 * never happened, which is worse than recording nothing.
 */
export function isSuccessStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 400;
}

export type AuditDecision = {
  method: string;
  statusCode: number;
  /** The actor's role; anything but ADMIN is out of scope for this trail. */
  role?: string | null;
};

export function shouldAudit({
  method,
  statusCode,
  role,
}: AuditDecision): boolean {
  return (
    role === UserRole.ADMIN &&
    isMutatingMethod(method) &&
    isSuccessStatus(statusCode)
  );
}

/** `/api` is the global prefix and `/admin` a mount point — neither is a resource. */
const MOUNT_PREFIXES = new Set(['api', 'admin']);

/**
 * Every route parameter normalizes to the same placeholder. The parameter's
 * name is irrelevant to the action string, and a single spelling means the
 * pattern-derived and the fallback-derived path agree — otherwise the same
 * action would appear twice in the `/actions` filter list.
 */
const PARAM = ':id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC = /^\d+$/;

/** Column widths; truncating here beats a driver-level insert failure. */
const MAX_ACTION = 100;
const MAX_RESOURCE_TYPE = 60;
const MAX_RESOURCE_ID = 36;

export type ResolvedRoute = {
  /** Placeholder-normalized segments, e.g. ['products', ':id', 'stock']. */
  segments: string[];
  /** Value bound to the last placeholder — the resource actually acted on. */
  resourceId: string | null;
};

function splitPath(value: string): string[] {
  return value
    .split('?')[0]
    .split('/')
    .filter((segment) => segment.length > 0);
}

function stripMountPrefixes(segments: string[]): string[] {
  let start = 0;
  while (start < segments.length && MOUNT_PREFIXES.has(segments[start]))
    start++;
  return segments.slice(start);
}

/**
 * The Express route pattern is authoritative when present: it marks parameters
 * explicitly, so a slug (`/products/summer-sale`) cannot be mistaken for a
 * static segment and explode the set of distinct action names. Only when the
 * pattern is missing — or does not line up with the URL that matched it — do we
 * fall back to recognising id-shaped segments.
 */
export function resolveRoute(
  routePath: string | undefined,
  url: string,
): ResolvedRoute {
  const raw = stripMountPrefixes(splitPath(url));
  const pattern = routePath ? stripMountPrefixes(splitPath(routePath)) : [];
  const aligned = pattern.length === raw.length && raw.length > 0;

  const segments: string[] = [];
  let resourceId: string | null = null;
  raw.forEach((value, index) => {
    const isParam = aligned
      ? pattern[index].startsWith(':')
      : UUID.test(value) || NUMERIC.test(value);
    if (!isParam) {
      segments.push(value.toLowerCase());
      return;
    }
    segments.push(PARAM);
    // Over-long values are dropped rather than truncated: half an identifier
    // points at nothing, and a wrong id is worse than an absent one.
    resourceId = value.length <= MAX_RESOURCE_ID ? value : null;
  });
  return { segments, resourceId };
}

/**
 * Collections in this API are plain English plurals (products, categories,
 * addresses), so three rules cover them. Applied to collection segments only —
 * facets like `status` would be mangled by any naive stemmer.
 */
function singularize(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Index of the collection segment the last placeholder belongs to. */
function collectionIndex(segments: string[]): number {
  const paramIndex = segments.lastIndexOf(PARAM);
  return paramIndex === -1 ? 0 : paramIndex - 1;
}

/**
 * The resource is the collection owning the last route parameter — for
 * `/products/:productId/reviews/:id` that is `review`, for
 * `/products/:id/stock` it is `product`. Derived from the route because the
 * body is the caller's claim about what changed, not evidence of it.
 */
export function deriveResourceType(segments: string[]): string | null {
  const collection = segments[collectionIndex(segments)];
  return collection && collection !== PARAM
    ? singularize(collection).slice(0, MAX_RESOURCE_TYPE)
    : null;
}

const VERBS: Record<string, string> = {
  POST: 'create',
  PUT: 'replace',
  PATCH: 'update',
  DELETE: 'delete',
};

/** Used when a path carries no collection segment at all, so the filter list stays honest. */
const UNKNOWN_RESOURCE = 'unknown';

/**
 * `<resource>[.<facet>...].<verb>`, e.g. `product.update`, `product.stock.change`,
 * `user.role.change`. Segments trailing the resource's parameter are its facets:
 * patching a whole resource is an `update`, patching one named facet of it is a
 * `change` to that facet, which is the distinction an operator actually cares
 * about when scanning the log.
 */
export function deriveAction(method: string, segments: string[]): string {
  const upper = method.toUpperCase();
  const paramIndex = segments.lastIndexOf(PARAM);
  const facets = segments.slice(
    paramIndex === -1 ? 1 : paramIndex + 1,
    segments.length,
  );
  const verb =
    upper === 'PATCH' && facets.length > 0
      ? 'change'
      : (VERBS[upper] ?? upper.toLowerCase());
  const resource = deriveResourceType(segments) ?? UNKNOWN_RESOURCE;
  return [resource, ...facets, verb].join('.').slice(0, MAX_ACTION);
}

/**
 * Allow-list, never a deny-list. Passwords, access tokens and refresh tokens all
 * flow through this application's request bodies, and a deny-list is wrong the
 * day someone adds a field nobody thought to deny. Adding a key here is a
 * deliberate act: it must be a scalar an auditor needs to read the row.
 */
export const AUDIT_METADATA_KEYS: readonly string[] = [
  'role',
  'isActive',
  'isVisible',
  'status',
  'reason',
  'note',
  'stock',
  'delta',
  'price',
  'quantity',
  'code',
  'name',
  'slug',
  'sku',
  'categoryId',
];

/** Free-text fields are bounded so one paste cannot bloat every row. */
const MAX_METADATA_STRING = 200;

/**
 * Picks the allow-listed scalars out of a request body.
 *
 * Two independent gates, because either alone has a failure mode:
 *  1. the allow-list — only these keys, and only when they hold a primitive.
 *     An allow-listed key holding an object could otherwise smuggle a nested
 *     `{ password }` past a key-name check.
 *  2. `redactSecrets` from common/logging/log-rules — the application already
 *     has one definition of what counts as a credential, and this reuses it
 *     rather than starting a second policy that will drift from the first. It
 *     is the net under the allow-list: if `token` is ever added to the list
 *     above by mistake, the shared rule still masks the value.
 */
export function auditMetadata(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    return null;
  const source = body as Record<string, unknown>;

  const picked: Record<string, unknown> = {};
  for (const key of AUDIT_METADATA_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    if (value === null) picked[key] = null;
    else if (typeof value === 'string')
      picked[key] = value.slice(0, MAX_METADATA_STRING);
    else if (typeof value === 'number' || typeof value === 'boolean')
      picked[key] = value;
  }

  if (Object.keys(picked).length === 0) return null;
  return redactSecrets(picked) as Record<string, unknown>;
}
