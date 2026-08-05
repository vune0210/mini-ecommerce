import { NotificationPreference } from './entities/notification-preference.entity';
import {
  Notification,
  NotificationMetadata,
  NotificationType,
} from './entities/notification.entity';

/** Matches the column widths in AddNotifications; see `clamp` for why. */
export const TITLE_MAX_LENGTH = 200;
export const BODY_MAX_LENGTH = 1000;
export const LINK_MAX_LENGTH = 512;

/**
 * What a customer can mute. Several types share one switch on purpose — see the
 * entity comment; ACCOUNT_SECURITY maps to null because it has no switch at all.
 */
export type NotificationCategory =
  | 'orderUpdates'
  | 'reviewUpdates'
  | 'promotions'
  | 'stockAlerts'
  | 'productAnswers';

export type NotificationPreferences = Record<NotificationCategory, boolean>;

const CATEGORY_BY_TYPE: Record<NotificationType, NotificationCategory | null> =
  {
    [NotificationType.ORDER_PLACED]: 'orderUpdates',
    [NotificationType.ORDER_STATUS_CHANGED]: 'orderUpdates',
    [NotificationType.REVIEW_MODERATED]: 'reviewUpdates',
    [NotificationType.COUPON_EXPIRING]: 'promotions',
    [NotificationType.STOCK_BACK]: 'stockAlerts',
    [NotificationType.ANSWER_POSTED]: 'productAnswers',
    [NotificationType.ACCOUNT_SECURITY]: null,
  };

export function categoryOf(
  type: NotificationType,
): NotificationCategory | null {
  return CATEGORY_BY_TYPE[type];
}

/** Opt-out: a customer who never touched the settings screen gets everything. */
export function defaultPreferences(): NotificationPreferences {
  return {
    orderUpdates: true,
    reviewUpdates: true,
    promotions: true,
    stockAlerts: true,
    productAnswers: true,
  };
}

/**
 * Field-by-field rather than a spread: the row also carries `id`, `userId` and
 * a `user` relation that a joined query would have populated, and none of that
 * belongs in a settings payload.
 */
export function serializePreferences(
  row: NotificationPreference | null,
): NotificationPreferences {
  if (!row) return defaultPreferences();
  return {
    orderUpdates: row.orderUpdates,
    reviewUpdates: row.reviewUpdates,
    promotions: row.promotions,
    stockAlerts: row.stockAlerts,
    productAnswers: row.productAnswers,
  };
}

/**
 * Decided before the INSERT, never after the SELECT. A muted notification that
 * still lands in the table and is merely filtered out of the list is not a
 * mute: it survives every future change to the read path, and it still shows up
 * in the unread badge the day someone writes a query that forgets the filter.
 */
export function isMuted(
  type: NotificationType,
  preferences: NotificationPreferences | null,
): boolean {
  const category = categoryOf(type);
  if (!category) return false;
  if (!preferences) return false;
  return !preferences[category];
}

/**
 * Ids are interpolated into SPA paths, so only a plain id is accepted. A value
 * carrying `/`, `?` or `..` would let whatever built the metadata steer the
 * customer somewhere the notification never claimed to point — the stored link
 * is relative precisely so it cannot leave the app, and this keeps it that way.
 */
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function idFrom(
  metadata: NotificationMetadata | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (typeof value !== 'string') return null;
  return SAFE_ID_PATTERN.test(value) ? value : null;
}

/**
 * The default destination for a type. Always returns something: a notification
 * the customer cannot click is a dead end, so a missing id falls back to the
 * list page that at least contains the thing being talked about.
 */
export function notificationLink(
  type: NotificationType,
  metadata: NotificationMetadata | null | undefined,
): string {
  switch (type) {
    case NotificationType.ORDER_PLACED:
    case NotificationType.ORDER_STATUS_CHANGED: {
      const orderId = idFrom(metadata, 'orderId');
      return orderId ? `/orders/${orderId}` : '/orders';
    }
    case NotificationType.REVIEW_MODERATED:
    case NotificationType.STOCK_BACK:
    case NotificationType.ANSWER_POSTED: {
      const productId = idFrom(metadata, 'productId');
      return productId ? `/products/${productId}` : '/products';
    }
    case NotificationType.COUPON_EXPIRING:
      // The SPA has no coupon page. The cart is where a code is actually
      // applied, which is what "your coupon expires soon" is asking for.
      return '/cart';
    case NotificationType.ACCOUNT_SECURITY:
      return '/dashboard';
  }
}

/**
 * Truncates instead of rejecting. An over-long title is a caller building prose
 * from a long product name, and MySQL's answer to that is either a truncation
 * warning or a hard error depending on sql_mode. Losing the tail of a sentence
 * is a better outcome than losing the notification — or, inside a caller's
 * transaction, than putting the order it describes at risk.
 */
function clamp(value: string | null | undefined, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export type NotificationDraft = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Overrides `notificationLink`; pass null to keep the derived default. */
  link?: string | null;
  metadata?: NotificationMetadata | null;
};

export type NotificationRow = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  metadata: NotificationMetadata | null;
};

/**
 * Normalizes a draft into the columns that get inserted. Kept pure so the whole
 * emit path — clamping, link derivation, metadata defaulting — is testable
 * without a database, which matters because emit failures are swallowed at
 * runtime and would otherwise only be visible in production logs.
 */
export function buildNotificationRow(
  draft: NotificationDraft,
): NotificationRow {
  const metadata = draft.metadata ?? null;
  // An explicit relative link wins; anything absolute is dropped rather than
  // stored, so a bad caller cannot turn the inbox into a redirector.
  const explicit = clamp(draft.link, LINK_MAX_LENGTH);
  const link =
    explicit && explicit.startsWith('/') && !explicit.startsWith('//')
      ? explicit
      : notificationLink(draft.type, metadata);
  return {
    userId: draft.userId,
    type: draft.type,
    title: clamp(draft.title, TITLE_MAX_LENGTH) ?? draft.type,
    body: clamp(draft.body, BODY_MAX_LENGTH),
    link,
    metadata,
  };
}

export type PublicNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  metadata: NotificationMetadata | null;
  /** Derived so the SPA never has to reason about a nullable timestamp. */
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
};

/**
 * The inbox projection. Field-by-field on purpose: spreading the entity would
 * publish `userId` and, whenever a query happened to join it, the entire `user`
 * row — password hash included — to a response body.
 */
export function serializeNotification(
  notification: Pick<
    Notification,
    | 'id'
    | 'type'
    | 'title'
    | 'body'
    | 'link'
    | 'metadata'
    | 'readAt'
    | 'createdAt'
  >,
): PublicNotification {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    metadata: notification.metadata,
    read: notification.readAt !== null,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

/**
 * MySQL resolves these by rolling back the whole transaction, not just the
 * failing statement. Every other error leaves the caller's transaction usable.
 */
const TRANSACTION_FATAL_CODES = ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'];

/** TypeORM wraps driver errors, but copies the driver's `code` onto the wrapper. */
function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as {
    code?: unknown;
    driverError?: { code?: unknown };
  };
  if (typeof candidate.code === 'string') return candidate.code;
  const driverCode = candidate.driverError?.code;
  return typeof driverCode === 'string' ? driverCode : null;
}

/**
 * Where the "never break the business operation" line sits.
 *
 * Emitting is best-effort: a customer's order must not roll back because the
 * notifications table was unreachable, out of disk, or briefly locked. So the
 * default is to log and continue. Two things are still rethrown:
 *
 * 1. Programming errors. A TypeError is a bug in the emitting code, not
 *    infrastructure trouble, and swallowing it means the notification silently
 *    never arrives and no test ever fails. These are exactly the failures that
 *    should be loud.
 * 2. Deadlock and lock-wait timeout, but only when emitting inside the caller's
 *    transaction. InnoDB has already rolled that entire transaction back by the
 *    time the error surfaces — swallowing it would let the caller COMMIT
 *    nothing and report success, losing the order itself rather than just the
 *    notification. Outside a caller's transaction the same error touches
 *    nothing but our own INSERT, so it stays swallowed.
 */
export function shouldRethrowEmitFailure(
  error: unknown,
  insideCallerTransaction: boolean,
): boolean {
  if (
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError
  )
    return true;
  if (!insideCallerTransaction) return false;
  const code = errorCode(error);
  return code !== null && TRANSACTION_FATAL_CODES.includes(code);
}
