import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, MessageSquare, Package, PackageCheck, ShieldCheck, Star, Tag, type LucideIcon } from 'lucide-react';
import type { BadgeTone } from '../components/ui';
import { useAuthStore } from '../stores/auth-store';
import type {
  AppNotification,
  MarkAllReadResult,
  NotificationCategory,
  NotificationListResponse,
  NotificationPreferences,
  NotificationQuery,
  NotificationType,
} from '../types/notification';
import { apiJson, apiVoid } from './api-client';
import { formatDate } from './format';

/** Every inbox query hangs off this prefix, so one invalidate busts list + badge. */
const notificationsKey = ['notifications'] as const;
/** Preferences sit on their own root: marking something read must not refetch them. */
const preferencesKey = ['notification-preferences'] as const;

export const NOTIFICATION_PAGE_SIZE = 20;
/** The dropdown is a preview of the inbox, not the inbox — eight rows fit without scrolling. */
export const NOTIFICATION_PREVIEW_SIZE = 8;

export function getNotifications(params: NotificationQuery & { limit: number }): Promise<NotificationListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.unreadOnly) query.set('unreadOnly', 'true');
  if (params.type) query.set('type', params.type);
  return apiJson<NotificationListResponse>(`/api/notifications?${query.toString()}`);
}
export const getUnreadCount = () => apiJson<{ unreadCount: number }>('/api/notifications/unread-count');
export const markNotificationRead = (id: string) => apiJson<AppNotification>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
export const markAllNotificationsRead = () => apiJson<MarkAllReadResult>('/api/notifications/read-all', { method: 'POST' });
export const deleteNotification = (id: string) => apiVoid(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const getNotificationPreferences = () => apiJson<NotificationPreferences>('/api/notifications/preferences');
/** Only the switches the customer touched are sent; absent keys keep their stored value. */
export const updateNotificationPreferences = (input: Partial<NotificationPreferences>) => apiJson<NotificationPreferences>('/api/notifications/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });

/**
 * Every route here is JWT-guarded, so a query that fires without a token gets a
 * 401 the SPA cannot do anything with — and the bell would sit spinning for a
 * logged-out visitor. Same guard as `useCart`.
 */
function useNotificationScope(): { userId: string | undefined; enabled: boolean } {
  const userId = useAuthStore((state) => state.user?.id);
  const hasTokens = useAuthStore((state) => Boolean(state.tokens));
  return { userId, enabled: Boolean(userId && hasTokens) };
}

/**
 * How often the badge re-checks for notifications raised by someone else — an
 * order shipped by staff, a coupon expiry sweep, an answer posted on a question.
 *
 * 60s, chosen from both ends:
 * - Anything the customer does themselves already updates the badge instantly:
 *   every mutation here invalidates the `['notifications']` prefix, and the list
 *   response carries `unreadCount`. Polling only has to catch *server-side*
 *   events, and none of them are ones a customer watches the clock for.
 * - The query is a single COUNT served entirely by IDX_notifications_user_read_at,
 *   but it is still one request per open tab per interval. 60s costs ~60 requests
 *   an hour of browsing; a 5s poll would cost ~720 for a minute of freshness
 *   nobody asked for.
 *
 * `refetchIntervalInBackground` is left at its default (false) on purpose: a tab
 * left open in another window stops polling until it is looked at again.
 */
export const UNREAD_POLL_INTERVAL_MS = 60_000;

export function useUnreadNotificationCount() {
  const { userId, enabled } = useNotificationScope();
  return useQuery({
    queryKey: [...notificationsKey, userId, 'unread-count'],
    queryFn: getUnreadCount,
    enabled,
    refetchInterval: UNREAD_POLL_INTERVAL_MS,
  });
}

/**
 * `options.enabled` is how the dropdown avoids loading rows nobody opened; it is
 * ANDed with the token guard rather than replacing it.
 */
export function useNotifications(params: NotificationQuery, options: { limit?: number; enabled?: boolean } = {}) {
  const { userId, enabled } = useNotificationScope();
  const limit = options.limit ?? NOTIFICATION_PAGE_SIZE;
  return useQuery({
    queryKey: [...notificationsKey, userId, 'list', { ...params, limit }],
    queryFn: () => getNotifications({ ...params, limit }),
    enabled: enabled && options.enabled !== false,
    // Holds the current page while a filter change loads, so the inbox does not
    // collapse to a skeleton on every checkbox click.
    placeholderData: keepPreviousData,
  });
}

export function useNotificationPreferences() {
  const { userId, enabled } = useNotificationScope();
  return useQuery({ queryKey: [...preferencesKey, userId], queryFn: getNotificationPreferences, enabled });
}

function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) { const client = useQueryClient(); return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))); }
export function useMarkNotificationRead() { const invalidate = useInvalidate([notificationsKey]); return useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate }); }
export function useMarkAllNotificationsRead() { const invalidate = useInvalidate([notificationsKey]); return useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate }); }
export function useDeleteNotification() { const invalidate = useInvalidate([notificationsKey]); return useMutation({ mutationFn: deleteNotification, onSuccess: invalidate }); }
/** Muting changes nothing already stored, so only the preferences key is busted. */
export function useUpdateNotificationPreferences() { const invalidate = useInvalidate([preferencesKey]); return useMutation({ mutationFn: updateNotificationPreferences, onSuccess: invalidate }); }

export function notificationError(error: unknown): string { if (!(error instanceof Error)) return 'Không thể cập nhật thông báo.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Không thể cập nhật thông báo.'; } catch { return error.message; } }

/** Filter order — the two order types first because they are most of an inbox. */
export const NOTIFICATION_TYPES: NotificationType[] = [
  'ORDER_PLACED',
  'ORDER_STATUS_CHANGED',
  'REVIEW_MODERATED',
  'ANSWER_POSTED',
  'STOCK_BACK',
  'COUPON_EXPIRING',
  'ACCOUNT_SECURITY',
];

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  ORDER_PLACED: 'Đặt hàng thành công',
  ORDER_STATUS_CHANGED: 'Cập nhật đơn hàng',
  REVIEW_MODERATED: 'Kiểm duyệt đánh giá',
  COUPON_EXPIRING: 'Mã giảm giá sắp hết hạn',
  STOCK_BACK: 'Có hàng trở lại',
  ANSWER_POSTED: 'Câu hỏi được trả lời',
  ACCOUNT_SECURITY: 'Bảo mật tài khoản',
};

export const NOTIFICATION_TYPE_TONE: Record<NotificationType, BadgeTone> = {
  ORDER_PLACED: 'sky',
  ORDER_STATUS_CHANGED: 'violet',
  REVIEW_MODERATED: 'amber',
  COUPON_EXPIRING: 'brand',
  STOCK_BACK: 'emerald',
  ANSWER_POSTED: 'brand',
  ACCOUNT_SECURITY: 'rose',
};

export const NOTIFICATION_TYPE_ICON: Record<NotificationType, LucideIcon> = {
  ORDER_PLACED: PackageCheck,
  ORDER_STATUS_CHANGED: Package,
  REVIEW_MODERATED: Star,
  COUPON_EXPIRING: Tag,
  STOCK_BACK: Bell,
  ANSWER_POSTED: MessageSquare,
  ACCOUNT_SECURITY: ShieldCheck,
};

/**
 * The mute switches, in the order the settings section shows them. `types` is
 * spelled out per row because a category covers more than its name suggests —
 * "đơn hàng" is two different notifications, and the copy has to say so.
 */
export const NOTIFICATION_CATEGORIES: ReadonlyArray<{
  key: NotificationCategory;
  label: string;
  description: string;
  types: NotificationType[];
}> = [
  {
    key: 'orderUpdates',
    label: 'Đơn hàng',
    description: 'Xác nhận đặt hàng và mọi thay đổi trạng thái đơn.',
    types: ['ORDER_PLACED', 'ORDER_STATUS_CHANGED'],
  },
  {
    key: 'reviewUpdates',
    label: 'Đánh giá của bạn',
    description: 'Khi quản trị viên ẩn hoặc khôi phục một đánh giá bạn đã viết.',
    types: ['REVIEW_MODERATED'],
  },
  {
    key: 'productAnswers',
    label: 'Câu hỏi sản phẩm',
    description: 'Khi có người trả lời câu hỏi bạn đã đặt cho sản phẩm.',
    types: ['ANSWER_POSTED'],
  },
  {
    key: 'stockAlerts',
    label: 'Báo có hàng',
    description: 'Khi sản phẩm bạn đang chờ được nhập hàng trở lại.',
    types: ['STOCK_BACK'],
  },
  {
    key: 'promotions',
    label: 'Khuyến mãi',
    description: 'Nhắc bạn dùng mã giảm giá trước khi hết hạn.',
    types: ['COUPON_EXPIRING'],
  },
];

const relative = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
const DIVISIONS: ReadonlyArray<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
];

/**
 * "3 giờ trước" is what a notification list needs; an exact timestamp there is
 * noise. Past a week the relative form stops helping, so it falls back to the
 * shared date format.
 */
export function relativeTime(value: string): string {
  let duration = (new Date(value).getTime() - Date.now()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) return relative.format(Math.round(duration), division.unit);
    duration /= division.amount;
  }
  return formatDate(value);
}
