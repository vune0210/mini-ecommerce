import { Ban, Check, Package, CirclePlus, Truck, Wallet } from 'lucide-react';
import type { OrderStatusEvent } from '../types/admin';
import type { OrderStatus } from '../types/order';
import { formatDateTime, ORDER_STATUS_LABEL } from '../lib/format';
import { Skeleton } from './ui';

const icons: Record<OrderStatus, typeof Check> = {
  PENDING: Package,
  PAID: Wallet,
  SHIPPED: Truck,
  COMPLETED: Check,
  CANCELLED: Ban,
};

const tones: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-600 ring-amber-100',
  PAID: 'bg-sky-50 text-sky-600 ring-sky-100',
  SHIPPED: 'bg-violet-50 text-violet-600 ring-violet-100',
  COMPLETED: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  CANCELLED: 'bg-rose-50 text-rose-600 ring-rose-100',
};

const roleLabel = (role: string | null): string =>
  role === 'ADMIN' ? 'Quản trị viên' : role === 'CUSTOMER' ? 'Khách hàng' : 'Hệ thống';

type Props = { events: OrderStatusEvent[]; isPending?: boolean };

/**
 * Audit trail of an order, oldest first. A null fromStatus is the creation
 * event, so it gets its own icon rather than pretending to be a transition.
 */
export function OrderStatusTimeline({ events, isPending }: Props) {
  if (isPending)
    return (
      <div className="space-y-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );

  if (!events.length)
    return <p className="text-sm text-slate-500">Chưa có sự kiện nào được ghi nhận.</p>;

  return (
    <ol className="relative space-y-6">
      {events.map((event, index) => {
        const created = event.fromStatus === null;
        const Icon = created ? CirclePlus : icons[event.toStatus];
        return (
          <li className="relative flex gap-4" key={`${event.createdAt}-${index}`}>
            {index < events.length - 1 && (
              <span
                className="absolute left-[19px] top-10 h-[calc(100%+0.5rem)] w-px bg-slate-200"
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full ring-4 ${
                created ? 'bg-brand-50 text-brand-600 ring-brand-100' : tones[event.toStatus]
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="font-medium text-slate-900">
                {created ? (
                  'Đơn hàng được tạo'
                ) : (
                  <>
                    {ORDER_STATUS_LABEL[event.toStatus]}
                    {event.fromStatus && (
                      <span className="font-normal text-slate-400">
                        {' '}
                        · từ {ORDER_STATUS_LABEL[event.fromStatus]}
                      </span>
                    )}
                  </>
                )}
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                {formatDateTime(event.createdAt)} · {roleLabel(event.actorRole)}
                {event.actorName && ` — ${event.actorName}`}
              </p>
              {event.note && (
                <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  {event.note}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
