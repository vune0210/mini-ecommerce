import { Bell, Check, CheckCheck, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  NOTIFICATION_PREVIEW_SIZE,
  NOTIFICATION_TYPE_ICON,
  NOTIFICATION_TYPE_LABEL,
  relativeTime,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '../lib/notification-api';
import { useAuthStore } from '../stores/auth-store';
import type { AppNotification } from '../types/notification';
import { Alert, SkeletonList } from './ui';

export function NotificationBell() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unread = useUnreadNotificationCount();
  // Rows are only fetched once the panel is opened — the badge alone is what
  // every page pays for.
  const recent = useNotifications(
    { page: 1, unreadOnly: false, type: '' },
    { limit: NOTIFICATION_PREVIEW_SIZE, enabled: open },
  );
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Nothing to poll and nothing to show for a signed-out visitor. Declared after
  // the hooks so the hook order never changes between renders.
  if (!user) return null;

  const unreadCount = recent.data?.unreadCount ?? unread.data?.unreadCount ?? 0;
  const items = recent.data?.items ?? [];

  /**
   * Marking read is fire-and-forget: the customer is already on their way to the
   * order, and blocking the navigation on a PATCH would make the whole row feel
   * broken whenever the network is slow. The invalidate that follows fixes the
   * badge a moment later.
   */
  function openNotification(item: AppNotification): void {
    setOpen(false);
    if (!item.read) markRead.mutate(item.id);
    if (item.link) navigate(item.link);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="relative rounded-lg p-2.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Thông báo, ${unreadCount} chưa đọc`}
        title="Thông báo"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          // The panel hangs off the button's right edge; on a phone the button is
          // not the rightmost element, so the width is capped to keep it inside
          // the viewport instead of pushing past the left margin.
          className="card animate-fade-in absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-5rem))] overflow-hidden"
          role="menu"
          aria-label="Thông báo gần đây"
        >
          <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Thông báo
              {unreadCount > 0 && (
                <span className="ml-2 text-xs font-medium text-brand-600">{unreadCount} chưa đọc</span>
              )}
            </h2>
            <button
              className="btn-ghost btn-sm"
              disabled={unreadCount === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              {markAll.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              )}
              Đánh dấu tất cả đã đọc
            </button>
          </header>

          <div className="max-h-96 overflow-y-auto">
            {recent.isPending ? (
              <div className="p-4">
                <SkeletonList count={4} className="h-14" />
              </div>
            ) : recent.isError ? (
              <div className="p-4">
                <Alert>Không thể tải thông báo.</Alert>
              </div>
            ) : !items.length ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                Bạn chưa có thông báo nào.
              </p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {items.map((item) => {
                  const Icon = NOTIFICATION_TYPE_ICON[item.type];
                  return (
                    <li
                      className={`flex items-start gap-2 px-2 py-1 ${item.read ? '' : 'bg-brand-50/40'}`}
                      key={item.id}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50"
                        onClick={() => openNotification(item)}
                      >
                        <span
                          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                            item.read ? 'bg-slate-100 text-slate-400' : 'bg-brand-100 text-brand-700'
                          }`}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm ${
                              item.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'
                            }`}
                          >
                            {item.title}
                          </span>
                          {item.body && (
                            <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">
                              {item.body}
                            </span>
                          )}
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {NOTIFICATION_TYPE_LABEL[item.type]} · {relativeTime(item.createdAt)}
                          </span>
                        </span>
                      </button>
                      {!item.read && (
                        <button
                          className="mt-2 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
                          disabled={markRead.isPending && markRead.variables === item.id}
                          onClick={() => markRead.mutate(item.id)}
                          aria-label={`Đánh dấu đã đọc: ${item.title}`}
                          title="Đánh dấu đã đọc"
                        >
                          {markRead.isPending && markRead.variables === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Check className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="border-t border-slate-100 px-4 py-3 text-center">
            <Link className="link text-sm" to="/notifications" onClick={() => setOpen(false)}>
              Xem tất cả thông báo
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}
