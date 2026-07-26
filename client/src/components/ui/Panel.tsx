import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type PanelProps = {
  title?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Tables need to reach the card edges, so their padding is applied per-cell. */
  bare?: boolean;
};

export function Panel({ title, icon: Icon, action, children, className = '', bare }: PanelProps) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            {Icon && <Icon className="h-4 w-4 text-slate-400" aria-hidden />}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={bare ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
};

export function PageHeader({ title, description, action, eyebrow }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-2 text-slate-500">{description}</p>}
      </div>
      {action}
    </header>
  );
}
