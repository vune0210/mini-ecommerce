import { ArrowRight, Mail, Receipt, ShieldCheck, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Badge, PageHeader } from '../components/ui';
import { useCart } from '../lib/cart-api';
import { useAuthStore } from '../stores/auth-store';

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const cartQuery = useCart();

  const shortcuts = [
    {
      to: '/orders',
      icon: Receipt,
      title: 'Đơn hàng của tôi',
      description: 'Theo dõi trạng thái và lịch sử mua hàng.',
    },
    {
      to: '/cart',
      icon: ShoppingCart,
      title: 'Giỏ hàng',
      description: cartQuery.data
        ? `${cartQuery.data.totalItems} sản phẩm đang chờ thanh toán.`
        : 'Xem lại các sản phẩm đã chọn.',
    },
    ...(user?.role === 'ADMIN'
      ? [
          {
            to: '/admin',
            icon: ShieldCheck,
            title: 'Khu vực quản trị',
            description: 'Quản lý sản phẩm, danh mục và đơn hàng.',
          },
        ]
      : []),
  ];

  return (
    <AppShell width="lg">
      <PageHeader title="Tài khoản" description="Thông tin cá nhân và lối tắt thường dùng." />

      <section className="card flex flex-wrap items-center gap-5 p-6">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-600 text-2xl font-bold uppercase text-white">
          {user?.name?.charAt(0) ?? '?'}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{user?.name}</h2>
            <Badge tone={user?.role === 'ADMIN' ? 'violet' : 'brand'}>
              {user?.role === 'ADMIN' ? 'Quản trị viên' : 'Khách hàng'}
            </Badge>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
            <Mail className="h-3.5 w-3.5" aria-hidden />
            {user?.email}
          </p>
        </div>
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((shortcut) => (
          <Link
            className="card group p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover"
            to={shortcut.to}
            key={shortcut.to}
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <shortcut.icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-4 flex items-center gap-1.5 font-semibold text-slate-900">
              {shortcut.title}
              <ArrowRight
                className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                aria-hidden
              />
            </h3>
            <p className="mt-1 text-sm text-slate-500">{shortcut.description}</p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
