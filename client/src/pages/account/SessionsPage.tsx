import { Globe, LogOut, MonitorSmartphone, ShieldOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AccountShell } from '../../components/AccountShell';
import { Alert, Badge, EmptyState, PageHeader, Panel, SkeletonList } from '../../components/ui';
import { accountError, useLogoutAll, useRevokeSession, useSessions } from '../../lib/account-api';
import { formatDateTime } from '../../lib/format';
import { useAuthStore } from '../../stores/auth-store';
import type { UserSession } from '../../types/auth';

const browsers: Array<[RegExp, string]> = [
  [/edg/i, 'Edge'],
  [/opr|opera/i, 'Opera'],
  [/chrome|crios/i, 'Chrome'],
  [/firefox|fxios/i, 'Firefox'],
  [/safari/i, 'Safari'],
];

const platforms: Array<[RegExp, string]> = [
  [/windows/i, 'Windows'],
  [/iphone|ipad|ipod/i, 'iOS'],
  [/android/i, 'Android'],
  [/mac os|macintosh/i, 'macOS'],
  [/linux/i, 'Linux'],
];

/** Best-effort label. The raw User-Agent stays visible underneath for the rest. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Thiết bị không xác định';
  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1];
  const platform = platforms.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && platform) return `${browser} trên ${platform}`;
  return browser ?? platform ?? 'Thiết bị không xác định';
}

export function SessionsPage() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const logoutAll = useLogoutAll();
  const navigate = useNavigate();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [error, setError] = useState<string | null>(null);

  const busy = revoke.isPending || logoutAll.isPending;

  /** The local store must be cleared too, or the app keeps showing dead tokens. */
  function signOutLocally(): void {
    clearAuth();
    navigate('/login', { replace: true });
  }

  function endSession(session: UserSession): void {
    setError(null);
    const question = session.current
      ? 'Đăng xuất khỏi thiết bị này? Bạn sẽ phải đăng nhập lại.'
      : `Thu hồi phiên đăng nhập trên “${describeDevice(session.userAgent)}”?`;
    if (!window.confirm(question)) return;
    revoke.mutate(session.id, {
      onSuccess: () => {
        if (session.current) signOutLocally();
      },
      onError: (reason) => setError(accountError(reason)),
    });
  }

  function endEverything(): void {
    setError(null);
    if (
      !window.confirm(
        'Đăng xuất khỏi tất cả thiết bị? Kể cả thiết bị này — bạn sẽ phải đăng nhập lại.',
      )
    )
      return;
    logoutAll.mutate(undefined, {
      onSuccess: signOutLocally,
      onError: (reason) => setError(accountError(reason)),
    });
  }

  const items = sessions.data ?? [];

  return (
    <AccountShell>
      <PageHeader
        title="Thiết bị đăng nhập"
        description="Những phiên đăng nhập còn hiệu lực. Thu hồi bất kỳ phiên nào bạn không nhận ra."
        action={
          items.length > 0 && (
            <button className="btn-danger" disabled={busy} onClick={endEverything}>
              <ShieldOff className="h-4 w-4" aria-hidden />
              Đăng xuất tất cả
            </button>
          )
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {sessions.isPending ? (
        <SkeletonList count={3} className="h-32" />
      ) : sessions.isError ? (
        <Alert>{accountError(sessions.error)}</Alert>
      ) : items.length === 0 ? (
        <EmptyState
          icon={MonitorSmartphone}
          title="Không có phiên đăng nhập nào"
          description="Phiên hiện tại có thể đã hết hạn. Hãy đăng nhập lại để xem danh sách thiết bị."
        />
      ) : (
        <div className={`space-y-4 transition-opacity ${sessions.isFetching ? 'opacity-60' : ''}`}>
          {items.map((session) => (
            <Panel
              key={session.id}
              className={session.current ? 'ring-2 ring-brand-500 ring-offset-2' : ''}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                    <MonitorSmartphone className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900">
                        {describeDevice(session.userAgent)}
                      </h2>
                      {session.current && <Badge tone="emerald">Thiết bị này</Badge>}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                      <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {session.ipAddress ?? 'Không rõ địa chỉ IP'}
                    </p>
                    <p className="mt-2 break-all text-xs text-slate-400">
                      {session.userAgent ?? 'Không có thông tin trình duyệt'}
                    </p>
                  </div>
                </div>

                <button
                  className={session.current ? 'btn-secondary btn-sm' : 'btn-danger btn-sm'}
                  disabled={busy}
                  onClick={() => endSession(session)}
                >
                  {session.current ? (
                    <>
                      <LogOut className="h-3.5 w-3.5" aria-hidden />
                      Đăng xuất thiết bị này
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Thu hồi
                    </>
                  )}
                </button>
              </div>

              <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400">Đăng nhập lúc</dt>
                  <dd className="mt-0.5 text-slate-700">{formatDateTime(session.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400">
                    Hoạt động gần nhất
                  </dt>
                  <dd className="mt-0.5 text-slate-700">
                    {session.lastUsedAt ? formatDateTime(session.lastUsedAt) : 'Chưa dùng lại'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400">Hết hạn</dt>
                  <dd className="mt-0.5 text-slate-700">{formatDateTime(session.expiresAt)}</dd>
                </div>
              </dl>
            </Panel>
          ))}
        </div>
      )}
    </AccountShell>
  );
}
