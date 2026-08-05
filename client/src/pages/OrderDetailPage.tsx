import { ArrowLeft, Ban, Check, History, MapPin, Package, PackageX, Phone, Ticket, Truck, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { OrderStatusTimeline } from '../components/OrderStatusTimeline';
import { Alert, EmptyState, Panel, Skeleton, StatusBadge } from '../components/ui';
import { formatDateTime, formatPrice, shippingAddress } from '../lib/format';
import {
  orderErrorMessage,
  PAYMENT_METHOD_LABEL,
  useCancelOrder,
  useOrder,
  useOrderHistory,
} from '../lib/order-api';
import type { OrderStatus } from '../types/order';

const steps: Array<{ status: OrderStatus; label: string; icon: typeof Check }> = [
  { status: 'PENDING', label: 'Chờ xử lý', icon: Package },
  { status: 'PAID', label: 'Đã thanh toán', icon: Wallet },
  { status: 'SHIPPED', label: 'Đang giao', icon: Truck },
  { status: 'COMPLETED', label: 'Hoàn tất', icon: Check },
];

function OrderProgress({ status }: { status: OrderStatus }) {
  const current = steps.findIndex((step) => step.status === status);
  return (
    <ol className="flex items-center">
      {steps.map((step, index) => {
        const done = index <= current;
        return (
          <li className="flex flex-1 items-center last:flex-none" key={step.status}>
            <div className="flex flex-col items-center gap-2">
              <span
                className={`grid h-10 w-10 place-items-center rounded-full ring-4 transition-colors ${
                  done
                    ? 'bg-brand-600 text-white ring-brand-100'
                    : 'bg-slate-100 text-slate-400 ring-transparent'
                }`}
              >
                <step.icon className="h-4 w-4" aria-hidden />
              </span>
              <span
                className={`whitespace-nowrap text-xs font-medium ${done ? 'text-slate-900' : 'text-slate-400'}`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                className={`mx-2 -mt-6 h-0.5 flex-1 rounded-full ${
                  index < current ? 'bg-brand-600' : 'bg-slate-200'
                }`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const orderQuery = useOrder(id);
  const historyQuery = useOrderHistory(id);
  const cancel = useCancelOrder();
  const [cancelNote, setCancelNote] = useState('');
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const order = orderQuery.data;

  return (
    <AppShell width="md">
      {orderQuery.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-72" />
          <Skeleton className="h-32" />
          <Skeleton className="h-56" />
        </div>
      ) : orderQuery.isError || !order ? (
        <EmptyState
          icon={PackageX}
          title="Không tìm thấy đơn hàng"
          description="Đơn hàng không tồn tại hoặc bạn không có quyền xem."
          action={
            <Link className="btn-primary" to="/orders">
              Quay lại đơn hàng
            </Link>
          }
        />
      ) : (
        <>
          <Link className="btn-ghost btn-sm -ml-3 mb-4" to="/orders">
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

          <div className="card mt-6 p-6">
            {order.status === 'CANCELLED' ? (
              <div className="flex items-center gap-3 text-rose-700">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-rose-50 ring-4 ring-rose-100">
                  <Ban className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">Đơn hàng đã huỷ</p>
                  <p className="text-sm text-rose-600">Số lượng sản phẩm đã được hoàn lại kho.</p>
                </div>
              </div>
            ) : (
              <OrderProgress status={order.status} />
            )}
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <Panel title="Giao tới" icon={MapPin}>
              <p className="font-medium text-slate-900">{order.recipientName}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
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

            <Panel title="Thanh toán" icon={Wallet}>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Số sản phẩm</dt>
                  <dd className="font-medium text-slate-900">{order.items.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Tạm tính</dt>
                  <dd className="font-medium text-slate-900">
                    {formatPrice(order.subtotalAmount)}
                  </dd>
                </div>
                {Number(order.discountAmount) > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="flex min-w-0 items-center gap-1.5 text-emerald-700">
                      <Ticket className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">
                        Giảm giá
                        {/* couponCode outlives a deleted coupon row, so it is the
                            only thing that can name the discount afterwards. */}
                        {order.couponCode && ` (${order.couponCode})`}
                      </span>
                    </dt>
                    <dd className="whitespace-nowrap font-medium text-emerald-700">
                      −{formatPrice(order.discountAmount)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-500">Phí vận chuyển</dt>
                  <dd className="font-medium text-slate-900">
                    {Number(order.shippingFee) > 0 ? formatPrice(order.shippingFee) : 'Miễn phí'}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3">
                <span className="font-semibold text-slate-900">Tổng cộng</span>
                <span className="text-xl font-bold text-slate-900">
                  {formatPrice(order.totalAmount)}
                </span>
              </div>
              <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Phương thức</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                  </dd>
                </div>
                {order.paidAt && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Đã thanh toán lúc</dt>
                    <dd className="text-right font-medium text-emerald-700">
                      {formatDateTime(order.paidAt)}
                    </dd>
                  </div>
                )}
              </dl>
            </Panel>
          </div>

          <Panel className="mt-6" title="Sản phẩm" icon={Package} bare>
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
          </Panel>

          <Panel className="mt-6" title="Lịch sử đơn hàng" icon={History}>
            {historyQuery.isError ? (
              <Alert>Không thể tải lịch sử đơn hàng.</Alert>
            ) : (
              <OrderStatusTimeline
                events={historyQuery.data ?? []}
                isPending={historyQuery.isPending}
              />
            )}
          </Panel>

          {cancel.isError && (
            <div className="mt-4">
              <Alert>{orderErrorMessage(cancel.error)}</Alert>
            </div>
          )}

          {order.status === 'PENDING' &&
            (confirmingCancel ? (
              <div className="card mt-6 p-5">
                <h3 className="font-semibold text-slate-900">Huỷ đơn hàng này?</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Toàn bộ sản phẩm sẽ được hoàn lại kho. Thao tác không thể hoàn tác.
                </p>
                <label className="label mt-4" htmlFor="cancel-note">
                  Lý do huỷ <span className="font-normal text-slate-400">(không bắt buộc)</span>
                </label>
                <textarea
                  className="field"
                  id="cancel-note"
                  rows={2}
                  maxLength={500}
                  placeholder="Ví dụ: đặt nhầm số lượng"
                  value={cancelNote}
                  onChange={(event) => setCancelNote(event.target.value)}
                />
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="btn-danger"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate({ id: order.id, note: cancelNote })}
                  >
                    <Ban className="h-4 w-4" aria-hidden />
                    {cancel.isPending ? 'Đang huỷ...' : 'Xác nhận huỷ'}
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={cancel.isPending}
                    onClick={() => setConfirmingCancel(false)}
                  >
                    Giữ đơn hàng
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-danger mt-6" onClick={() => setConfirmingCancel(true)}>
                <Ban className="h-4 w-4" aria-hidden />
                Huỷ đơn hàng
              </button>
            ))}

          {order.status === 'COMPLETED' && (
            <div className="mt-6">
              <Alert tone="success">
                Đơn đã hoàn tất — bạn có thể đánh giá các sản phẩm trong đơn ở trang chi tiết sản phẩm.
              </Alert>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
