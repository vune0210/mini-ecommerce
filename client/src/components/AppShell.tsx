import { Activity, ShoppingBag } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppNav } from './AppNav';

const widths = {
  sm: 'max-w-3xl',
  md: 'max-w-4xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
  full: 'max-w-7xl',
} as const;

type AppShellProps = {
  children: ReactNode;
  width?: keyof typeof widths;
  /** Full-bleed pages (product list hero) manage their own horizontal padding. */
  bleed?: boolean;
};

export function AppShell({ children, width = 'xl', bleed }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppNav />
      <main
        className={
          bleed
            ? 'flex-1'
            : `mx-auto w-full flex-1 px-4 py-8 sm:px-6 lg:py-10 ${widths[width]}`
        }
      >
        {children}
      </main>
      <AppFooter />
    </div>
  );
}

export function AppFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
        <p className="flex items-center gap-2 font-semibold text-slate-700">
          <ShoppingBag className="h-4 w-4 text-brand-600" aria-hidden />
          MiniShop
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link className="hover:text-slate-900" to="/products">
            Sản phẩm
          </Link>
          <Link className="hover:text-slate-900" to="/orders">
            Đơn hàng
          </Link>
          <Link className="flex items-center gap-1.5 hover:text-slate-900" to="/health">
            <Activity className="h-3.5 w-3.5" aria-hidden />
            Trạng thái hệ thống
          </Link>
        </nav>
        <p>© {new Date().getFullYear()} MiniShop</p>
      </div>
    </footer>
  );
}
