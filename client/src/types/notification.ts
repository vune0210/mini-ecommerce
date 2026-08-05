/**
 * Mirrors the server's notifications module. Every `Date` on the wire arrives as
 * an ISO string, so `readAt`/`createdAt` are typed as strings here rather than
 * as the `Date` the entity declares.
 */

/** Mirrors server NotificationType (entities/notification.entity.ts). */
export type NotificationType =
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_PLACED'
  | 'REVIEW_MODERATED'
  | 'COUPON_EXPIRING'
  | 'STOCK_BACK'
  | 'ANSWER_POSTED'
  | 'ACCOUNT_SECURITY';

/** Flat and scalar by contract — the server refuses to nest anything here. */
export type NotificationMetadata = Record<string, string | number | boolean | null>;

/** Mirrors server PublicNotification. `read` is derived from `readAt`. */
export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** A relative SPA path such as `/orders/<id>`; never absolute. */
  link: string | null;
  metadata: NotificationMetadata | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};

/**
 * Mirrors server PaginatedNotifications. `unreadCount` rides along with the page
 * so the badge and the list can never disagree after a mark-read.
 */
export type NotificationListResponse = {
  items: AppNotification[];
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
};

/** Filters of the inbox. `type: ''` means "every category". */
export type NotificationQuery = { page: number; unreadOnly: boolean; type: '' | NotificationType };

export type MarkAllReadResult = { updated: number; unreadCount: number };

/**
 * Mirrors server NotificationCategory. Several types share one switch, and
 * ACCOUNT_SECURITY deliberately has none — see the preferences entity.
 */
export type NotificationCategory =
  | 'orderUpdates'
  | 'reviewUpdates'
  | 'promotions'
  | 'stockAlerts'
  | 'productAnswers';

export type NotificationPreferences = Record<NotificationCategory, boolean>;
