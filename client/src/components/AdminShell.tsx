import {
  LayoutDashboard,
  MessageSquareText,
  MessagesSquare,
  Package,
  Receipt,
  Tags,
  TicketPercent,
  Users,
  Warehouse,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { AppNav } from './AppNav';

const items = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'Sản phẩm', icon: Package, end: false },
  { to: '/admin/inventory', label: 'Kho hàng', icon: Warehouse, end: false },
  { to: '/admin/categories', label: 'Danh mục', icon: Tags, end: false },
  { to: '/admin/orders', label: 'Đơn hàng', icon: Receipt, end: false },
  { to: '/admin/coupons', label: 'Mã giảm giá', icon: TicketPercent, end: false },
  {
    to: '/admin/reviews',
    label: 'Đánh giá',
    icon: MessageSquareText,
    end: false,
  },
  {
    to: '/admin/questions',
    label: 'Hỏi & đáp',
    icon: MessagesSquare,
    end: false,
  },
  { to: '/admin/users', label: 'Người dùng', icon: Users, end: false },
];

const itemClass = ({ isActive }: { isActive: boolean }): string =>
  `flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brand-600 text-white shadow-sm'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <AppNav />
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside>
          <nav className="flex gap-1 overflow-x-auto pb-2 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible lg:pb-0">
            <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 lg:block">
              Quản trị
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
