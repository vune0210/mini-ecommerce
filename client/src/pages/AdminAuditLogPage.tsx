import { RefreshCw, ScrollText, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { DateRangeFilter } from '../components/admin/DateRangeFilter';
import {
  Alert,
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
  Panel,
  Skeleton,
} from '../components/ui';
import {
  AUDIT_LOG_PAGE_SIZE,
  auditError,
  useAuditActions,
  useAuditActors,
  useAuditLog,
  useRefreshAuditLog,
} from '../lib/audit-api';
import { formatDateTime } from '../lib/format';
import type { StatsQuery } from '../types/admin';
import type { AuditActorFilter, AuditLogEntry } from '../types/audit';

/**
 * Readable Vietnamese for the route-derived action strings. Deliberately a
 * lookup with a fallback rather than a translation attempt: an action added on
 * the server tomorrow renders as its raw name, which is honest, instead of
 * being mangled into something that reads like a label but is not one.
 */
const ACTION_LABEL: Record<string, string> = {
  'product.create': 'Tạo sản phẩm',
  'product.update': 'Sửa sản phẩm',
  'product.delete': 'Xoá sản phẩm',
  'product.stock.change': 'Điều chỉnh tồn kho',
  'category.create': 'Tạo danh mục',
  'category.update': 'Sửa danh mục',
  'category.delete': 'Xoá danh mục',
  'coupon.create': 'Tạo mã giảm giá',
  'coupon.update': 'Sửa mã giảm giá',
  'coupon.delete': 'Xoá mã giảm giá',
  'order.status.change': 'Đổi trạng thái đơn',
  'user.role.change': 'Đổi quyền tài khoản',
  'user.status.change': 'Khoá/mở tài khoản',
  'review.visibility.change': 'Ẩn/hiện đánh giá',
  'question.visibility.change': 'Ẩn/hiện câu hỏi',
  'answer.visibility.change': 'Ẩn/hiện câu trả lời',
};

/** Where a resource can be opened in the SPA. Absent means "no page for it". */
const RESOURCE_LINK: Record<string, (id: string) => string> = {
  product: (id) => `/products/${id}`,
  order: (id) => `/admin/orders/${id}`,
  user: () => '/admin/users',
  coupon: () => '/admin/coupons',
  category: () => '/admin/categories',
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

export function AdminAuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [resourceIdInput, setResourceIdInput] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [actor, setActor] = useState<AuditActorFilter | null>(null);
  const [range, setRange] = useState<StatsQuery>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const actions = useAuditActions();
  const actors = useAuditActors();
  const refresh = useRefreshAuditLog();
  const log = useAuditLog({
    page,
    actorUserId: actor?.id ?? '',
    action,
    resourceType,
    resourceId,
    from: range.from,
    to: range.to,
  });

  // Debounced so typing an id does not fire a request per keystroke; the same
  // 350ms the other admin tables use.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (resourceIdInput.trim() === resourceId) return;
      setResourceId(resourceIdInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [resourceId, resourceIdInput]);

  const data = log.data;
  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / AUDIT_LOG_PAGE_SIZE))
    : 1;
  const resourceTypes = [
    ...new Set(
      (actions.data?.actions ?? [])
        .map((name) => name.split('.')[0])
        .filter(Boolean),
    ),
  ].sort();

  function reset(): void {
    setAction('');
    setResourceType('');
    setResourceIdInput('');
    setResourceId('');
    setActor(null);
    setRange({});
    setPage(1);
  }

  function resourceHref(entry: AuditLogEntry): string | null {
    if (!entry.resourceType || !entry.resourceId) return null;
    const build = RESOURCE_LINK[entry.resourceType];
    return build ? build(entry.resourceId) : null;
  }

  const hasFilters = Boolean(
    action || resourceType || resourceId || actor || range.from || range.to,
  );

  return (
    <AdminShell>
      <PageHeader
        title="Nhật ký thao tác"
        description="Ai đã làm gì trong khu vực quản trị."
        action={
          <button className="btn-secondary" type="button" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Làm mới
          </button>
        }
      />

      {/*
        Scope stated plainly. Every clause here is checked against
        server/src/audit/audit-rules.ts and the migration — an audit page that
        overstates what it records is worse than no page.
      */}
      <Alert tone="info" className="mb-6">
        Nhật ký chỉ ghi các thao tác <strong>thay đổi dữ liệu</strong> (POST,
        PATCH, PUT, DELETE) do tài khoản <strong>quản trị</strong> thực hiện và{' '}
        <strong>thành công</strong>. Nội dung request không được lưu nguyên vẹn
        — chỉ một vài trường vô hại trong danh sách cho phép. Nhật ký bắt đầu từ
        ngày tính năng này được bật, không có dữ liệu quá khứ được dựng lại.
      </Alert>

      <DateRangeFilter
        value={range}
        onChange={(next) => {
          setRange(next);
          setPage(1);
        }}
      />

      <div className="mb-6 grid gap-3 lg:grid-cols-4">
        <select
          className="field"
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
          aria-label="Lọc theo hành động"
        >
          <option value="">Mọi hành động</option>
          {(actions.data?.actions ?? []).map((name) => (
            <option value={name} key={name}>
              {actionLabel(name)}
            </option>
          ))}
        </select>

        <select
          className="field"
          value={resourceType}
          onChange={(event) => {
            setResourceType(event.target.value);
            setPage(1);
          }}
          aria-label="Lọc theo loại đối tượng"
        >
          <option value="">Mọi đối tượng</option>
          {resourceTypes.map((type) => (
            <option value={type} key={type}>
              {type}
            </option>
          ))}
        </select>

        <select
          className="field"
          value={actor?.id ?? ''}
          onChange={(event) => {
            const found = actors.data?.items.find(
              (row) => row.id === event.target.value,
            );
            setActor(found ? { id: found.id, email: found.email } : null);
            setPage(1);
          }}
          aria-label="Lọc theo người thực hiện"
        >
          <option value="">Mọi người thực hiện</option>
          {(actors.data?.items ?? []).map((row) => (
            <option value={row.id} key={row.id}>
              {row.email}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            className="field pl-10"
            value={resourceIdInput}
            onChange={(event) => setResourceIdInput(event.target.value)}
            placeholder="ID đối tượng..."
            aria-label="Lọc theo ID đối tượng"
          />
        </div>
      </div>

      {(actor || hasFilters) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {actor && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {actor.email}
              <button
                type="button"
                onClick={() => setActor(null)}
                aria-label="Bỏ lọc người thực hiện"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          )}
          <button className="btn-ghost text-sm" type="button" onClick={reset}>
            Xoá bộ lọc
          </button>
        </div>
      )}

      {log.isError && <Alert>{auditError(log.error)}</Alert>}

      <Panel bare>
        {log.isLoading ? (
          <div className="grid gap-2 p-5">
            {[0, 1, 2, 3, 4].map((slot) => (
              <Skeleton className="h-12" key={slot} />
            ))}
          </div>
        ) : !data?.items.length ? (
          <div className="p-5">
            <EmptyState
              icon={ScrollText}
              title="Chưa có bản ghi nào"
              description={
                hasFilters
                  ? 'Không có thao tác nào khớp bộ lọc hiện tại.'
                  : 'Nhật ký sẽ xuất hiện khi quản trị viên thực hiện thay đổi.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-semibold">Thời điểm</th>
                  <th className="px-5 py-3 font-semibold">Người thực hiện</th>
                  <th className="px-5 py-3 font-semibold">Hành động</th>
                  <th className="px-5 py-3 font-semibold">Đối tượng</th>
                  <th className="px-5 py-3 font-semibold">Kết quả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((entry) => {
                  const href = resourceHref(entry);
                  const open = expanded === entry.id;
                  return (
                    <>
                      <tr
                        className="cursor-pointer align-top transition-colors hover:bg-slate-50"
                        key={entry.id}
                        onClick={() => setExpanded(open ? null : entry.id)}
                      >
                        <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                          {formatDateTime(entry.createdAt)}
                        </td>
                        <td className="px-5 py-3">
                          <span className="block font-medium text-slate-800">
                            {entry.actorEmail}
                          </span>
                          <span className="text-xs text-slate-400">
                            {entry.actorRole}
                            {/* The FK is ON DELETE SET NULL, so the snapshot is
                                all that is left once the account is removed. */}
                            {!entry.actorUserId && ' · tài khoản đã bị xoá'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="block font-medium text-slate-800">
                            {actionLabel(entry.action)}
                          </span>
                          <span className="font-mono text-xs text-slate-400">
                            {entry.action}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {entry.resourceType ? (
                            <>
                              <span className="text-slate-600">
                                {entry.resourceType}
                              </span>
                              {href && entry.resourceId && (
                                <Link
                                  className="link ml-2 font-mono text-xs"
                                  to={href}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  mở
                                </Link>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <Badge
                            tone={entry.statusCode < 300 ? 'emerald' : 'slate'}
                          >
                            {entry.statusCode}
                          </Badge>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50" key={`${entry.id}-detail`}>
                          <td className="px-5 py-3" colSpan={5}>
                            <dl className="grid gap-2 text-xs sm:grid-cols-2">
                              <div>
                                <dt className="text-slate-400">Đường dẫn</dt>
                                <dd className="font-mono break-all text-slate-700">
                                  {entry.method} {entry.path}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-400">
                                  Request ID (đối chiếu log máy chủ)
                                </dt>
                                <dd className="font-mono break-all text-slate-700">
                                  {entry.requestId ?? '—'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-400">Địa chỉ IP</dt>
                                <dd className="font-mono text-slate-700">
                                  {entry.ipAddress ?? '—'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-400">
                                  Dữ liệu kèm theo
                                </dt>
                                <dd className="font-mono break-all text-slate-700">
                                  {entry.metadata
                                    ? JSON.stringify(entry.metadata)
                                    : '—'}
                                </dd>
                              </div>
                            </dl>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {data && data.total > AUDIT_LOG_PAGE_SIZE && (
        <div className="mt-6">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </AdminShell>
  );
}
