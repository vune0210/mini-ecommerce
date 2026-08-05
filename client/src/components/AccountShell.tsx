import { KeyRound, MapPin, MonitorSmartphone, Receipt, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { AppNav } from './AppNav';

const items = [
  { to: '/account/profile', label: 'Hồ sơ', icon: UserRound, end: false },
  { to: '/account/password', label: 'Đổi mật khẩu', icon: KeyRound, end: false },
  { to: '/account/sessions', label: 'Thiết bị đăng nhập', icon: MonitorSmartphone, end: false },
  { to: '/account/addresses', label: 'Sổ địa chỉ', icon: MapPin, end: false },
  { to: '/orders', label: 'Đơn hàng của tôi', icon: Receipt, end: false },
];

const itemClass = ({ isActive }: { isActive: boolean }): string =>
  `flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brand-600 text-white shadow-sm'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

/** Customer-side twin of AdminShell: same sidebar mechanics, account links. */
export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <AppNav />
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside>
          <nav className="flex gap-1 overflow-x-auto pb-2 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible lg:pb-0">
            <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 lg:block">
              Tài khoản
            </p>
            {items.map((item) => (
              <NavLink className={itemClass} to={item.to} end={item.end} key={item.to}>
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
