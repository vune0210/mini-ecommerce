import { CircleAlert, CircleCheckBig, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

type AlertTone = 'error' | 'success' | 'info' | 'warning';

const styles: Record<AlertTone, { box: string; icon: typeof Info }> = {
  error: { box: 'border-red-200 bg-red-50 text-red-800', icon: CircleAlert },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: CircleCheckBig },
  info: { box: 'border-brand-200 bg-brand-50 text-brand-800', icon: Info },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-800', icon: TriangleAlert },
};

type AlertProps = { children: ReactNode; tone?: AlertTone; className?: string };

export function Alert({ children, tone = 'error', className = '' }: AlertProps) {
  const { box, icon: Icon } = styles[tone];
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${box} ${className}`}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
