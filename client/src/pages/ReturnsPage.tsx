import { ChevronRight, PackageOpen, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Alert, Badge, EmptyState, PageHeader, Pagination, SkeletonList } from '../components/ui';
import { formatDateTime, formatPrice } from '../lib/format';
import {
  RETURN_PAGE_SIZE,
  RETURN_REASON_LABEL,
  RETURN_STATUS_LABEL,
  RETURN_STATUS_TONE,
  RETURN_STATUSES,
  useReturns,
} from '../lib/return-api';
import type { ReturnStatus } from '../types/return';

const filters: Array<{ value: '' | ReturnStatus; label: string }> = [
  { value: '', label: 'Tất cả' },
  ...RETURN_STATUSES.map((status) => ({ value: status, label: RETURN_STATUS_LABEL[status] })),
];

export function ReturnsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | ReturnStatus>('');
  const returns = useReturns({ page, status });
  const totalPages = returns.data ? Math.max(1, Math.ceil(returns.data.total / RETURN_PAGE_SIZE)) : 1;

  function changeStatus(next: '' | ReturnStatus): void {
    setStatus(next);
    setPage(1);
  }

  return (
    <AppShell width="lg">
      <PageHeader
        title="Yêu cầu trả hàng"
        description="Theo dõi tiến trình xử lý và số tiền hoàn của từng yêu cầu."
      />

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

      {returns.isPending ? (
        <SkeletonList count={4} />
      ) : returns.isError ? (
        <Alert>Không thể tải danh sách yêu cầu trả hàng.</Alert>
      ) : !returns.data?.items.length ? (
        <EmptyState
          icon={PackageOpen}
          title={status ? 'Không có yêu cầu ở trạng thái này' : 'Bạn chưa có yêu cầu trả hàng nào'}
          description={
            status
              ? 'Thử chọn một trạng thái khác để xem thêm.'
              : 'Bạn có thể tạo yêu cầu trả hàng từ trang chi tiết của một đơn đã hoàn tất.'
          }
          action={
            !status ? (
              <Link className="btn-primary" to="/orders">
                Tới đơn hàng của tôi
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {returns.data.items.map((request) => {
              const quantity = request.items.reduce((total, item) => total + item.quantity, 0);
              return (
                <Link
                  className="card group flex items-center gap-4 p-5 transition hover:border-brand-200 hover:shadow-card-hover"
                  to={`/returns/${request.id}`}
                  key={request.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-semibold tracking-tight text-slate-900">
                        {request.requestNumber}
                      </p>
                      <Badge tone={RETURN_STATUS_TONE[request.status]}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                        {RETURN_STATUS_LABEL[request.status]}
                      </Badge>
                      <Badge>
                        <Undo2 className="h-3 w-3" aria-hidden />
                        {RETURN_REASON_LABEL[request.reason]}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-500">
                      {formatDateTime(request.createdAt)}
                      {/* The order relation comes back with the list; a request
                          without it still renders rather than showing "undefined". */}
                      {request.order && ` · đơn ${request.order.orderNumber}`}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {request.items.length} dòng hàng · {quantity} sản phẩm
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-slate-900">{formatPrice(request.refundAmount)}</p>
                    <p className="mt-0.5 text-xs text-slate-400">Tiền hoàn</p>
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
            summary={`${returns.data.total} yêu cầu`}
          />
        </>
      )}
    </AppShell>
  );
}