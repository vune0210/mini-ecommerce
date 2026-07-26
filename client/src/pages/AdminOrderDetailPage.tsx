import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, History, MapPin, Package, PackageX, Phone, User, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { OrderStatusTimeline } from '../components/OrderStatusTimeline';
import { Alert, EmptyState, Panel, Skeleton, StatusBadge } from '../components/ui';
import { adminError, useUpdateOrderStatus } from '../lib/admin-api';
import { formatDateTime, formatPrice, ORDER_STATUS_LABEL, shippingAddress } from '../lib/format';
import { getOrder, useOrderHistory } from '../lib/order-api';
import type { OrderStatus } from '../types/order';

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function AdminOrderDetailPage() {
  const { id = '' } = useParams();
  const orderQuery = useQuery({ queryKey: ['orders', id], queryFn: () => getOrder(id), enabled: Boolean(id) });
  const historyQuery = useOrderHistory(id);
  const update = useUpdateOrderStatus();
  const [next, setNext] = useState<'' | OrderStatus>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const order = orderQuery.data;

  function apply(): void {
    if (!next || !order) return;
    setError(null);
    update.mutate(
      { id: order.id, status: next, note },
      {
        onSuccess: () => {
          setNext('');
          setNote('');
        },
        onError: (reason) => setError(adminError(reason)),
      },
    );
  }

  return (
    <AdminShell>
      {orderQuery.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-72" />
          <Skeleton className="h-56" />
        </div>
      ) : orderQuery.isError || !order ? (
        <EmptyState
          icon={PackageX}
          title="Không tìm thấy đơn hàng"
          action={
            <Link className="btn-primary" to="/admin/orders">
              Quay lại danh sách đơn
            </Link>
          }
        />
      ) : (
        <>
          <Link className="btn-ghost btn-sm -ml-3 mb-4" to="/admin/orders">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Tất cả đơn hàng
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Đơn {order.orderNumber}
              </h1>
              <p className="mt-2 text-slate-500">Đặt lúc {formatDateTime(order.createdAt)}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              <Panel title="Giao tới" icon={MapPin}>
                <p className="flex items-center gap-2 font-medium text-slate-900">
                  <User className="h-4 w-4 text-slate-400" aria-hidden />
                  {order.recipientName}
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {order.phone}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{shippingAddress(order)}</p>
                {order.note && (
                  <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                    Ghi chú: {order.note}
                  </p>
                )}
              </Panel>

              <Panel title="Sản phẩm" icon={Package} bare>
                <ul className="divide-y divide-slate-100">
                  {order.items.map((item) => (
                    <li className="flex items-center justify-between gap-4 px-5 py-4" key={item.id}>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{item.productName}</p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {formatPrice(item.unitPrice)} × {item.quantity}
                        </p>
                      </div>
                      <p className="whitespace-nowrap font-semibold text-slate-900">
                        {formatPrice(item.subtotal)}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="flex items-baseline justify-between border-t border-slate-100 px-5 py-4">
                  <span className="font-semibold text-slate-900">Tổng cộng</span>
                  <span className="text-xl font-bold text-slate-900">
                    {formatPrice(order.totalAmount)}
                  </span>
                </div>
              </Panel>

              <Panel title="Lịch sử trạng thái" icon={History}>
                {historyQuery.isError ? (
                  <Alert>Không thể tải lịch sử đơn hàng.</Alert>
                ) : (
                  <OrderStatusTimeline
                    events={historyQuery.data ?? []}
                    isPending={historyQuery.isPending}
                  />
                )}
              </Panel>
            </div>

            <aside className="card p-6 lg:sticky lg:top-24">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                <Wallet className="h-4 w-4 text-brand-600" aria-hidden />
                Chuyển trạng thái
              </h2>

              {transitions[order.status].length === 0 ? (
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                  Đơn đã ở trạng thái kết thúc — không còn bước chuyển nào.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="label" htmlFor="next-status">
                      Trạng thái mới
                    </label>
                    <select
                      className="field"
                      id="next-status"
                      value={next}
                      onChange={(event) => setNext(event.target.value as '' | OrderStatus)}
                    >
                      <option value="">Chọn trạng thái</option>
                      {transitions[order.status].map((status) => (
                        <option key={status} value={status}>
                          {ORDER_STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="status-note">
                      Ghi chú <span className="font-normal text-slate-400">(không bắt buộc)</span>
                    </label>
                    <textarea
                      className="field"
                      id="status-note"
                      rows={3}
                      maxLength={500}
                      placeholder="Lý do hoặc thông tin thêm, lưu vào lịch sử đơn"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>
                  {error && <Alert>{error}</Alert>}
                  <button
                    className="btn-primary w-full"
                    disabled={!next || update.isPending}
                    onClick={apply}
                  >
                    {update.isPending ? 'Đang cập nhật...' : 'Cập nhật trạng thái'}
                  </button>
                  {next === 'CANCELLED' && (
                    <p className="text-xs text-amber-600">
                      Huỷ đơn sẽ hoàn lại tồn kho cho từng sản phẩm trong đơn.
                    </p>
                  )}
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </AdminShell>
  );
}
