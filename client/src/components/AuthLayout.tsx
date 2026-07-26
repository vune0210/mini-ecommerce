import { Receipt, ShoppingBag, Star, Truck } from 'lucide-react';
import type { FormEventHandler, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from './ui';

const highlights = [
  { icon: Truck, text: 'Đặt hàng và theo dõi trạng thái giao hàng' },
  { icon: Receipt, text: 'Xem lại toàn bộ lịch sử đơn hàng của bạn' },
  { icon: Star, text: 'Đánh giá sản phẩm sau khi đơn hoàn tất' },
];

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  error: string | null;
  onSubmit: FormEventHandler<HTMLFormElement>;
  footer: ReactNode;
};

export function AuthLayout({ title, subtitle, children, error, onSubmit, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-12 text-white lg:flex">
        <Link className="flex items-center gap-2.5" to="/products">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25">
            <ShoppingBag className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-bold tracking-tight">MiniShop</span>
        </Link>

        <div>
          <h2 className="max-w-md text-3xl font-bold leading-tight tracking-tight">
            Mua sắm nhanh gọn, quản lý đơn hàng dễ dàng.
          </h2>
          <ul className="mt-8 space-y-4">
            {highlights.map((item) => (
              <li className="flex items-center gap-3 text-brand-100" key={item.text}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
                  <item.icon className="h-4 w-4" aria-hidden />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-brand-200">© {new Date().getFullYear()} MiniShop</p>
      </aside>

      <main className="flex items-center justify-center bg-slate-50 p-6">
        <form className="w-full max-w-sm" onSubmit={onSubmit} noValidate>
          <Link className="mb-8 flex items-center gap-2.5 text-slate-900 lg:hidden" to="/products">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
              <ShoppingBag className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-lg font-bold tracking-tight">MiniShop</span>
          </Link>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>

          {error && (
            <div className="mt-6">
              <Alert>{error}</Alert>
            </div>
          )}

          <div className="mt-6 space-y-4">{children}</div>

          <p className="mt-6 text-center text-sm text-slate-500">{footer}</p>
        </form>
      </main>
    </div>
  );
}

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
};

export function AuthField({ id, label, error, children }: FieldProps) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}
