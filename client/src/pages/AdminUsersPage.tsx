import { Ban, CircleCheck, Search, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { Alert, Badge, PageHeader, Panel, Pagination, Skeleton } from '../components/ui';
import {
  ADMIN_USER_PAGE_SIZE,
  adminError,
  useAdminUsers,
  useUpdateUserRole,
  useUpdateUserStatus,
} from '../lib/admin-api';
import { formatDate } from '../lib/format';
import { useAuthStore } from '../stores/auth-store';
import type { AdminUser } from '../types/admin';
import type { UserRole } from '../types/auth';

export function AdminUsersPage() {
  const me = useAuthStore((state) => state.user);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'' | UserRole>('');
  const [isActive, setIsActive] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const users = useAdminUsers({ page, search, role, isActive });
  const changeRole = useUpdateUserRole();
  const changeStatus = useUpdateUserStatus();
  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / ADMIN_USER_PAGE_SIZE)) : 1;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput.trim() === search) return;
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, searchInput]);

  const busy = changeRole.isPending || changeStatus.isPending;
  const onError = (reason: unknown) => setError(adminError(reason));

  function toggleRole(user: AdminUser): void {
    setError(null);
    const next: UserRole = user.role === 'ADMIN' ? 'CUSTOMER' : 'ADMIN';
    if (
      next === 'CUSTOMER' &&
      !window.confirm(`Gỡ quyền quản trị của “${user.name}”?`)
    )
      return;
    changeRole.mutate({ id: user.id, role: next }, { onError });
  }

  function toggleActive(user: AdminUser): void {
    setError(null);
    if (
      user.isActive &&
      !window.confirm(
        `Khoá tài khoản “${user.name}”? Họ sẽ bị đăng xuất ngay và không đăng nhập lại được.`,
      )
    )
      return;
    changeStatus.mutate({ id: user.id, isActive: !user.isActive }, { onError });
  }

  return (
    <AdminShell>
      <PageHeader
        title="Người dùng"
        description="Phân quyền và khoá tài khoản. Tài khoản bị khoá bị từ chối ở mọi request, đăng nhập và làm mới token."
        action={users.data && <Badge tone="slate">{users.data.total} tài khoản</Badge>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            className="field pl-10"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm tên hoặc email..."
            aria-label="Tìm người dùng"
          />
        </div>
        <select
          className="field"
          value={role}
          onChange={(event) => {
            setRole(event.target.value as '' | UserRole);
            setPage(1);
          }}
          aria-label="Lọc theo vai trò"
        >
          <option value="">Tất cả vai trò</option>
          <option value="ADMIN">Quản trị viên</option>
          <option value="CUSTOMER">Khách hàng</option>
        </select>
        <select
          className="field"
          value={isActive}
          onChange={(event) => {
            setIsActive(event.target.value as '' | 'true' | 'false');
            setPage(1);
          }}
          aria-label="Lọc theo trạng thái"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="true">Đang hoạt động</option>
          <option value="false">Đã khoá</option>
        </select>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {users.isPending ? (
        <Skeleton className="h-64" />
      ) : users.isError ? (
        <Alert>Không thể tải danh sách người dùng.</Alert>
      ) : (
        <>
          <Panel bare>
            <div className={`overflow-x-auto transition-opacity ${users.isFetching ? 'opacity-60' : ''}`}>
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3 font-semibold">Người dùng</th>
                    <th className="px-5 py-3 font-semibold">Vai trò</th>
                    <th className="px-5 py-3 font-semibold">Trạng thái</th>
                    <th className="px-5 py-3 font-semibold">Tham gia</th>
                    <th className="px-5 py-3 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.data?.items.map((user) => {
                    const self = user.id === me?.id;
                    return (
                      <tr className="transition-colors hover:bg-slate-50/60" key={user.id}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold uppercase text-brand-700">
                              {user.name.charAt(0)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900">
                                {user.name}
                                {self && (
                                  <span className="ml-2 text-xs font-normal text-slate-400">(bạn)</span>
                                )}
                              </p>
                              <p className="truncate text-xs text-slate-400">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={user.role === 'ADMIN' ? 'violet' : 'slate'}>
                            {user.role === 'ADMIN' ? 'Quản trị viên' : 'Khách hàng'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={user.isActive ? 'emerald' : 'rose'}>
                            {user.isActive ? 'Hoạt động' : 'Đã khoá'}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-2">
                            {/* The API refuses self-mutation; hiding the buttons
                                explains why instead of showing a 400. */}
                            {self ? (
                              <span className="text-xs text-slate-400">Không thể tự đổi</span>
                            ) : (
                              <>
                                <button
                                  className="btn-secondary btn-sm"
                                  disabled={busy}
                                  onClick={() => toggleRole(user)}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                                  {user.role === 'ADMIN' ? 'Gỡ quyền' : 'Cấp quyền'}
                                </button>
                                <button
                                  className={user.isActive ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}
                                  disabled={busy}
                                  onClick={() => toggleActive(user)}
                                >
                                  {user.isActive ? (
                                    <>
                                      <Ban className="h-3.5 w-3.5" aria-hidden />
                                      Khoá
                                    </>
                                  ) : (
                                    <>
                                      <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                                      Mở khoá
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!users.data?.items.length && (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
                    <Users className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-3 font-medium text-slate-700">Không có tài khoản nào khớp bộ lọc</p>
                </div>
              )}
            </div>
          </Panel>
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            summary={`${users.data?.total ?? 0} tài khoản`}
          />
        </>
      )}
    </AdminShell>
  );
}
