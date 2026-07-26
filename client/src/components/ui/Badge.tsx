import type { ReactNode } from 'react';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type StatusTone } from '../../lib/format';
import type { OrderStatus } from '../../types/order';

export type BadgeTone = StatusTone | 'slate' | 'brand';

const tones: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
};

type BadgeProps = { children: ReactNode; tone?: BadgeTone; className?: string };

export function Badge({ children, tone = 'slate', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Order status is shown in a dozen places — label and colour must match everywhere. */
export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={ORDER_STATUS_TONE[status]}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}
