import { Receipt, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { ExportButton } from '../components/admin/ExportButton';
import { Alert, PageHeader, Panel, Pagination, Skeleton, StatusBadge } from '../components/ui';
import { ADMIN_ORDER_PAGE_SIZE, adminError, useAdminOrders, useUpdateOrderStatus } from '../lib/admin-api';
import { formatDate, formatPrice, ORDER_STATUS_LABEL, ORDER_STATUSES } from '../lib/format';
import type { OrderStatus } from '../types/order';

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function AdminOrdersPage() {
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const orders = useAdminOrders({ page, status, search });
  const update = useUpdateOrderStatus();
  const totalPages = orders.data ? Math.max(1, Math.ceil(orders.data.total / ADMIN_ORDER_PAGE_SIZE)) : 1;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput.trim() === search) return;
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, searchInput]);

  return (
    <AdminShell>
      <PageHeader
        title="Đơn hàng"
        description="Tra cứu và cập nhật trạng thái đơn của khách."
        action={<ExportButton kind="orders" params={{ status }} label="Xuất CSV" />}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            className="field pl-10"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm mã đơn, tên hoặc email khách..."
            aria-label="Tìm đơn hàng"
          />
        </div>
        <select
          className="field"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as '' | OrderStatus);
            setPage(1);
          }}
          aria-label="Lọc theo trạng thái"
        >
          <option value="">Tất cả trạng thái</option>
          {ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABEL[value]}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {orders.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <Panel bare>
            <div className="overflow-x-auto">
              {/* Seven columns do not fit a laptop viewport; scroll rather than crush them. */}
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3 font-semibold">Mã đơn</th>
                    <th className="px-5 py-3 font-semibold">Khách hàng</th>
                    <th className="px-5 py-3 font-semibold">Giao tới</th>
                    <th className="px-5 py-3 font-semibold">Trạng thái</th>
                    <th className="px-5 py-3 text-right font-semibold">Tổng</th>
                    <th className="px-5 py-3 font-semibold">Ngày đặt</th>
                    <th className="px-5 py-3 font-semibold">Chuyển trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {orders.data?.items.map((order) => (
                    <tr className="transition-colors hover:bg-slate-50/60" key={order.id}>
                      <td className="whitespace-nowrap px-5 py-3">
                        <Link
                          className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                          to={`/admin/orders/${order.id}`}
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <p className="font-medium text-slate-900">{order.user.name}</p>
                        <p className="text-xs text-slate-400">{order.user.email}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <p className="text-slate-700">{order.recipientName}</p>
                        <p className="text-xs text-slate-400">{order.phone}</p>
                        <p className="text-xs text-slate-400">{order.city}</p>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatPrice(order.totalAmount)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        {transitions[order.status].length ? (
                          <select
                            className="field w-36 py-1.5 text-xs"
                            defaultValue=""
                            disabled={update.isPending}
                            aria-label={`Chuyển trạng thái đơn ${order.orderNumber}`}
                            onChange={(event) => {
                              const next = event.target.value as OrderStatus;
                              if (!next) return;
                              update.mutate(
                                { id: order.id, status: next },
                                { onError: (reason) => setError(adminError(reason)) },
                              );
                            }}
                          >
                            <option value="">Chọn trạng thái</option>
                            {transitions[order.status].map((value) => (
                              <option key={value} value={value}>
                                {ORDER_STATUS_LABEL[value]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-slate-400">Đã kết thúc</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!orders.data?.items.length && (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
                    <Receipt className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-3 font-medium text-slate-700">
                    Không có đơn hàng nào khớp bộ lọc
                  </p>
                  <p className="mt-1 text-sm text-slate-500">Thử đổi từ khoá hoặc trạng thái.</p>
                </div>
              )}
            </div>
          </Panel>
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            summary={`${orders.data?.total ?? 0} đơn hàng`}
          />
        </>
      )}
    </AdminShell>
  );
}
