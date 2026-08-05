import { CheckCheck, Inbox, Loader2, Lock, Settings, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Alert, Badge, EmptyState, PageHeader, Pagination, Panel, Skeleton } from '../components/ui';
import { formatDateTime } from '../lib/format';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_TYPE_ICON,
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_TONE,
  NOTIFICATION_TYPES,
  notificationError,
  relativeTime,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationPreferences,
  useNotifications,
  useUpdateNotificationPreferences,
} from '../lib/notification-api';
import type { NotificationCategory, NotificationType } from '../types/notification';

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState<'' | NotificationType>('');

  const list = useNotifications({ page, unreadOnly, type });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const removeOne = useDeleteNotification();

  const data = list.data;
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / NOTIFICATION_PAGE_SIZE));
  const actionError = markRead.error ?? markAll.error ?? removeOne.error;

  return (
    <AppShell width="lg">
      <PageHeader
        title="Thông báo"
        description="Mọi cập nhật về đơn hàng, đánh giá và khuyến mãi của bạn, mới nhất trước."
        action={
          <button
            className="btn-secondary"
            disabled={unreadCount === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            {markAll.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CheckCheck className="h-4 w-4" aria-hidden />
            )}
            Đánh dấu tất cả đã đọc
          </button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <select
          className="field sm:max-w-xs"
          value={type}
          onChange={(event) => {
            setType(event.target.value as '' | NotificationType);
            setPage(1);
          }}
          aria-label="Lọc theo loại thông báo"
        >
          <option value="">Tất cả loại thông báo</option>
          {NOTIFICATION_TYPES.map((value) => (
            <option value={value} key={value}>
              {NOTIFICATION_TYPE_LABEL[value]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => {
              setUnreadOnly(event.target.checked);
              setPage(1);
            }}
          />
          Chỉ hiện chưa đọc
          {unreadCount > 0 && <Badge tone="brand">{unreadCount}</Badge>}
        </label>
      </div>

      {actionError && (
        <div className="mb-4">
          <Alert>{notificationError(actionError)}</Alert>
        </div>
      )}

      {list.isPending ? (
        <Skeleton className="h-72" />
      ) : list.isError ? (
        <Alert>Không thể tải thông báo. Vui lòng thử lại.</Alert>
      ) : !data?.items.length ? (
        <EmptyState
          icon={Inbox}
          title={unreadOnly || type ? 'Không có thông báo nào khớp bộ lọc' : 'Bạn chưa có thông báo nào'}
          description={
            unreadOnly || type
              ? 'Hãy bỏ bớt bộ lọc để xem toàn bộ hộp thư.'
              : 'Khi có cập nhật về đơn hàng hoặc sản phẩm bạn quan tâm, thông báo sẽ xuất hiện ở đây.'
          }
          action={
            <Link className="btn-primary" to="/products">
              Khám phá cửa hàng
            </Link>
          }
        />
      ) : (
        <>
          <Panel bare>
            <ul
              className={`divide-y divide-slate-100 transition-opacity ${list.isFetching ? 'opacity-60' : ''}`}
            >
              {data.items.map((item) => {
                const Icon = NOTIFICATION_TYPE_ICON[item.type];
                const marking = markRead.isPending && markRead.variables === item.id;
                const removing = removeOne.isPending && removeOne.variables === item.id;
                return (
                  <li
                    className={`flex flex-wrap items-start gap-4 px-5 py-4 ${item.read ? '' : 'bg-brand-50/40'}`}
                    key={item.id}
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                        item.read ? 'bg-slate-100 text-slate-400' : 'bg-brand-100 text-brand-700'
                      }`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={NOTIFICATION_TYPE_TONE[item.type]}>
                          {NOTIFICATION_TYPE_LABEL[item.type]}
                        </Badge>
                        {!item.read && (
                          <span className="text-xs font-semibold text-brand-700">Chưa đọc</span>
                        )}
                      </div>
                      {/* The link is a relative SPA path by contract, so an
                          in-app <Link> is always the right element for it. */}
                      {item.link ? (
                        <Link
                          className={`mt-1.5 block ${item.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'} hover:text-brand-700`}
                          to={item.link}
                          onClick={() => {
                            if (!item.read) markRead.mutate(item.id);
                          }}
                        >
                          {item.title}
                        </Link>
                      ) : (
                        <p
                          className={`mt-1.5 ${item.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}
                        >
                          {item.title}
                        </p>
                      )}
                      {item.body && <p className="mt-1 text-sm text-slate-500">{item.body}</p>}
                      <p className="mt-1.5 text-xs text-slate-400">
                        <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
                          {relativeTime(item.createdAt)}
                        </time>
                        {item.readAt && ` · Đã đọc ${relativeTime(item.readAt)}`}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {!item.read && (
                        <button
                          className="btn-secondary btn-sm"
                          disabled={marking || removing}
                          onClick={() => markRead.mutate(item.id)}
                        >
                          {marking ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Đánh dấu đã đọc
                        </button>
                      )}
                      <button
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        disabled={marking || removing}
                        onClick={() => removeOne.mutate(item.id)}
                        aria-label={`Xoá thông báo: ${item.title}`}
                        title="Xoá thông báo"
                      >
                        {removing ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            summary={`${total} thông báo`}
          />
        </>
      )}

      <div className="mt-10">
        <NotificationPreferencesSection />
      </div>
    </AppShell>
  );
}

function NotificationPreferencesSection() {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  // The PATCH returns the whole set, but the row has to look switched the moment
  // it is clicked; the in-flight variables are layered over the stored value.
  const value = preferences.data
    ? { ...preferences.data, ...(update.isPending ? update.variables : undefined) }
    : undefined;

  function toggle(key: NotificationCategory, next: boolean): void {
    // Only the switch that moved is sent, so a stale tab cannot re-enable a
    // category muted somewhere else.
    update.mutate({ [key]: next });
  }

  return (
    <Panel title="Cài đặt thông báo" icon={Settings}>
      <Alert tone="info" className="mb-5">
        Tắt một nhóm sẽ khiến hệ thống <strong>không tạo</strong> thông báo mới thuộc nhóm đó nữa —
        đây không phải bộ lọc hiển thị. Những thông báo đã nhận trước đó vẫn nằm nguyên trong hộp
        thư và vẫn được tính là chưa đọc.
      </Alert>

      {update.isError && (
        <div className="mb-4">
          <Alert>{notificationError(update.error)}</Alert>
        </div>
      )}

      {preferences.isPending ? (
        <Skeleton className="h-56" />
      ) : preferences.isError || !value ? (
        <Alert>Không thể tải cài đặt thông báo.</Alert>
      ) : (
        <ul className="divide-y divide-slate-100">
          {NOTIFICATION_CATEGORIES.map((category) => (
            <li className="flex items-start justify-between gap-4 py-4 first:pt-0" key={category.key}>
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{category.label}</p>
                <p className="mt-0.5 text-sm text-slate-500">{category.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {category.types.map((item) => (
                    <Badge tone="slate" key={item}>
                      {NOTIFICATION_TYPE_LABEL[item]}
                    </Badge>
                  ))}
                </div>
              </div>
              <ToggleSwitch
                checked={value[category.key]}
                disabled={update.isPending}
                label={`${value[category.key] ? 'Tắt' : 'Bật'} thông báo ${category.label}`}
                onChange={(next) => toggle(category.key, next)}
              />
            </li>
          ))}

          {/* ACCOUNT_SECURITY maps to no category on the server, so there is no
              switch to render — an inert toggle would be a lie. */}
          <li className="flex items-start justify-between gap-4 py-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium text-slate-900">
                <Lock className="h-4 w-4 text-slate-400" aria-hidden />
                Bảo mật tài khoản
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                Đổi mật khẩu, đăng nhập mới, thu hồi phiên. Nhóm này luôn được gửi và không thể tắt:
                đây là cách bạn phát hiện người khác chiếm tài khoản, và kẻ tấn công sẽ tắt nó đầu
                tiên nếu được phép.
              </p>
            </div>
            <Badge tone="rose">Luôn bật</Badge>
          </li>
        </ul>
      )}
    </Panel>
  );
}

type ToggleSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
};

function ToggleSwitch({ checked, disabled, label, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-brand-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
