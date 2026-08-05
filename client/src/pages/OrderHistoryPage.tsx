import { ChevronRight, Receipt, Ticket } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Alert, Badge, EmptyState, PageHeader, Pagination, SkeletonList, StatusBadge } from '../components/ui';
import { formatDateTime, formatPrice, ORDER_STATUS_LABEL, ORDER_STATUSES } from '../lib/format';
import { ORDER_PAGE_SIZE, useOrders } from '../lib/order-api';
import type { OrderStatus } from '../types/order';

const filters: Array<{ value: '' | OrderStatus; label: string }> = [
  { value: '', label: 'Tất cả' },
  ...ORDER_STATUSES.map((status) => ({ value: status, label: ORDER_STATUS_LABEL[status] })),
];

export function OrderHistoryPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const orders = useOrders({ page, status });
  const totalPages = orders.data ? Math.max(1, Math.ceil(orders.data.total / ORDER_PAGE_SIZE)) : 1;

  function changeStatus(next: '' | OrderStatus): void {
    setStatus(next);
    setPage(1);
  }

  return (
    <AppShell width="lg">
      <PageHeader title="Đơn hàng của tôi" description="Theo dõi trạng thái và lịch sử mua hàng." />

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái">
        {filters.map((filter) => (
          <button
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              status === filter.value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
            onClick={() => changeStatus(filter.value)}
            aria-pressed={status === filter.value}
            key={filter.value || 'all'}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {orders.isPending ? (
        <SkeletonList count={4} />
      ) : orders.isError ? (
        <Alert>Không thể tải đơn hàng.</Alert>
      ) : !orders.data?.items.length ? (
        <EmptyState
          icon={Receipt}
          title={status ? 'Không có đơn hàng ở trạng thái này' : 'Bạn chưa có đơn hàng nào'}
          description={
            status
              ? 'Thử chọn một trạng thái khác để xem thêm.'
              : 'Khi bạn đặt hàng, đơn sẽ xuất hiện tại đây.'
          }
          action={
            !status ? (
              <Link className="btn-primary" to="/products">
                Bắt đầu mua sắm
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {orders.data.items.map((order) => {
              const discount = Number(order.discountAmount);
              return (
                <Link
                  className="card group flex items-center gap-4 p-5 transition hover:border-brand-200 hover:shadow-card-hover"
                  to={`/orders/${order.id}`}
                  key={order.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-semibold tracking-tight text-slate-900">
                        {order.orderNumber}
                      </p>
                      <StatusBadge status={order.status} />
                      {discount > 0 && (
                        <Badge tone="emerald">
                          <Ticket className="h-3 w-3" aria-hidden />
                          {order.couponCode ?? 'Đã giảm giá'}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm text-slate-500">
                      {formatDateTime(order.createdAt)}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {order.items.length} sản phẩm · Giao tới {order.recipientName}, {order.city}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-slate-900">{formatPrice(order.totalAmount)}</p>
                    {discount > 0 && (
                      <p className="mt-0.5 text-xs font-medium text-emerald-700">
                        −{formatPrice(order.discountAmount)}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600"
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            summary={`${orders.data.total} đơn hàng`}
          />
        </>
      )}
    </AppShell>
  );
}
