import {
  ArrowRight,
  Heart,
  Mail,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Star,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Alert, Badge, PageHeader, Skeleton } from '../components/ui';
import {
  ACCOUNT_ACTION_COPY,
  useAccountOverview,
} from '../lib/account-overview-api';
import { useCart } from '../lib/cart-api';
import { formatPrice } from '../lib/format';
import { useAuthStore } from '../stores/auth-store';

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const cartQuery = useCart();
  const overview = useAccountOverview();

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

      {overview.isLoading && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((slot) => (
            <Skeleton className="h-24" key={slot} />
          ))}
        </div>
      )}

      {overview.isError && (
        <div className="mt-6">
          <Alert>Không tải được tổng quan tài khoản.</Alert>
        </div>
      )}

      {overview.data && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Receipt,
                label: 'Đơn đã đặt',
                value: String(overview.data.orders.total),
                hint: `${overview.data.orders.countable} đơn được tính chi tiêu`,
              },
              {
                icon: Wallet,
                label: 'Tổng chi tiêu',
                value: formatPrice(overview.data.spend.lifetime),
                // Cancelled and unpaid orders are excluded, exactly as the
                // shop's own revenue report excludes them.
                hint: `Trung bình ${formatPrice(overview.data.spend.average)}/đơn`,
              },
              {
                icon: Heart,
                label: 'Đang lưu',
                value: String(overview.data.saved.wishlist),
                hint: `${overview.data.saved.stockAlerts} sản phẩm chờ hàng về`,
              },
              {
                icon: Star,
                label: 'Đánh giá đã viết',
                value: String(overview.data.reviews.written),
                hint:
                  overview.data.reviews.invited > 0
                    ? `${overview.data.reviews.invited} sản phẩm chờ đánh giá`
                    : 'Bạn đã đánh giá hết',
              },
            ].map((stat) => (
              <div className="card p-5" key={stat.label}>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500">
                  <stat.icon className="h-4 w-4" aria-hidden />
                </span>
                <p className="mt-3 text-sm text-slate-500">{stat.label}</p>
                <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-slate-400">{stat.hint}</p>
              </div>
            ))}
          </div>

          {overview.data.actions.length > 0 && (
            <section className="mt-6 grid gap-3">
              <h2 className="text-sm font-semibold text-slate-500">
                Cần bạn xử lý
              </h2>
              {overview.data.actions.map((action) => {
                const copy = ACCOUNT_ACTION_COPY[action];
                return (
                  <div
                    className="card flex flex-wrap items-center justify-between gap-3 p-4"
                    key={action}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{copy.title}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{copy.body}</p>
                    </div>
                    <Link className="btn-secondary shrink-0" to={copy.to}>
                      {copy.cta}
                    </Link>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

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
