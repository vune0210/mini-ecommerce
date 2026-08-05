import type { LucideIcon } from 'lucide-react';
import { Boxes, Package, Percent, Truck, TrendingUp, TriangleAlert, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { CategoryRevenuePanel } from '../components/admin/CategoryRevenuePanel';
import { CouponPanel } from '../components/admin/CouponPanel';
import { DateRangeFilter } from '../components/admin/DateRangeFilter';
import { ExportButton } from '../components/admin/ExportButton';
import { RevenueChart } from '../components/admin/RevenueChart';
import { TopCustomersPanel } from '../components/admin/TopCustomersPanel';
import { Alert, Badge, PageHeader, Panel, Skeleton } from '../components/ui';
import { useAdminStats } from '../lib/admin-api';
import { formatPrice, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, ORDER_STATUSES } from '../lib/format';
import type { StatsQuery } from '../types/admin';

type TileProps = { label: string; value: string; hint?: string; icon: LucideIcon; tone: string };

function Tile({ label, value, hint, icon: Icon, tone }: TileProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
    </div>
  );
}

export function AdminDashboardPage() {
  const [range, setRange] = useState<StatsQuery>({});
  const stats = useAdminStats(range);
  const data = stats.data;

  return (
    <AdminShell>
      <PageHeader
        eyebrow="Tổng quan"
        title="Bảng điều khiển"
        description="Số liệu bán hàng và tình trạng kho. Chỉ đơn đã thanh toán trở lên được tính vào doanh thu."
        action={
          <div className="flex flex-wrap items-start gap-2">
            <ExportButton kind="orders" params={{ ...range }} label="Xuất đơn hàng" />
            <ExportButton kind="products" label="Xuất sản phẩm" />
            <ExportButton kind="customers" label="Xuất khách hàng" />
          </div>
        }
      />

      <DateRangeFilter value={range} onChange={setRange} />

      {stats.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="h-32" key={index} />
          ))}
        </div>
      ) : stats.isError ? (
        <Alert>Không thể tải số liệu thống kê.</Alert>
      ) : data ? (
        // Held at reduced opacity while a new range loads — a skeleton flash on
        // every date change would make the whole dashboard jump.
        <div className={`transition-opacity ${stats.isFetching ? 'opacity-60' : ''}`}>
          {/* Without from/to the server reports all-time totals but still trails
              the chart 30 ngày — saying so beats letting the two look inconsistent. */}
          {data.range.appliesTo === 'series-only' && (
            <p className="mb-4 text-sm text-slate-400">
              Đang xem toàn thời gian: các con số tổng hợp tính trên mọi đơn, riêng biểu đồ chỉ vẽ 30
              ngày gần nhất. Chọn một khoảng thời gian để lọc tất cả.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label="Tiền thu về"
              value={formatPrice(data.revenue.net)}
              hint={`Đã hoàn tất: ${formatPrice(data.revenue.completed)}`}
              icon={Wallet}
              tone="bg-emerald-50 text-emerald-600"
            />
            <Tile
              label="Đơn tính doanh thu"
              value={String(data.orders.countable)}
              hint={`Tổng ${data.orders.total} đơn · TB ${formatPrice(data.orders.averageOrderValue)}`}
              icon={TrendingUp}
              tone="bg-brand-50 text-brand-600"
            />
            <Tile
              label="Khách hàng"
              value={String(data.customers.total)}
              hint={`Mới trong kỳ: ${data.customers.newInRange} · Mua lại: ${data.customers.repeat}`}
              icon={Users}
              tone="bg-sky-50 text-sky-600"
            />
            <Tile
              label="Sản phẩm"
              value={String(data.products.total)}
              hint={`Hết hàng: ${data.products.outOfStock} · Chưa xuất bản: ${data.products.unpublished}`}
              icon={Boxes}
              tone="bg-violet-50 text-violet-600"
            />
          </div>

          <div className="mt-6">
            <RevenueChart series={data.series} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel title="Cấu thành doanh thu">
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-slate-500">
                    <Package className="h-4 w-4 text-slate-300" aria-hidden />
                    Tiền hàng
                  </dt>
                  <dd className="font-medium tabular-nums text-slate-900">
                    {formatPrice(data.revenue.merchandise)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-slate-500">
                    <Percent className="h-4 w-4 text-slate-300" aria-hidden />
                    Giảm giá
                  </dt>
                  <dd className="font-medium tabular-nums text-rose-600">
                    −{formatPrice(data.revenue.discounts)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-slate-500">
                    <Truck className="h-4 w-4 text-slate-300" aria-hidden />
                    Phí vận chuyển
                  </dt>
                  <dd className="font-medium tabular-nums text-slate-900">
                    {formatPrice(data.revenue.shipping)}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
                <span className="font-semibold text-slate-900">Tiền thu về</span>
                <span className="text-xl font-bold tabular-nums text-slate-900">
                  {formatPrice(data.revenue.net)}
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Đơn đã huỷ ({formatPrice(data.revenue.cancelled)}) và đơn chờ xử lý không nằm trong
                con số này.
              </p>
            </Panel>

            <Panel title="Đơn theo trạng thái">
              <div className="grid gap-3 sm:grid-cols-3">
                {ORDER_STATUSES.map((status) => (
                  <div className="rounded-xl bg-slate-50 p-4 text-center" key={status}>
                    <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                      {data.orders.byStatus[status]}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Panel title="Bán chạy nhất" icon={TrendingUp} bare>
              {data.topProducts.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                        <th className="px-5 py-3 font-semibold">Sản phẩm</th>
                        <th className="whitespace-nowrap px-5 py-3 text-right font-semibold">Đã bán</th>
                        <th className="whitespace-nowrap px-5 py-3 text-right font-semibold">
                          Doanh thu
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.topProducts.map((row) => (
                        <tr key={`${row.productId ?? 'deleted'}-${row.productName}`}>
                          <td className="px-5 py-3 font-medium text-slate-900">{row.productName}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                            {row.quantitySold}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                            {formatPrice(row.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-5 text-sm text-slate-500">Chưa có dữ liệu bán hàng.</p>
              )}
            </Panel>

            <TopCustomersPanel rows={data.topCustomers} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <CategoryRevenuePanel rows={data.revenueByCategory} />

            <Panel title="Sắp hết hàng" icon={TriangleAlert} bare>
              {data.lowStock.length ? (
                <ul className="divide-y divide-slate-50">
                  {data.lowStock.map((product) => (
                    <li className="flex items-center justify-between gap-4 px-5 py-3" key={product.id}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Package className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                        <span className="truncate text-sm font-medium text-slate-900">
                          {product.name}
                        </span>
                      </span>
                      <Badge tone={product.stock === 0 ? 'rose' : 'amber'}>
                        {product.stock === 0 ? 'Hết hàng' : `Còn ${product.stock}`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-5 text-sm text-slate-500">Tồn kho đang ổn định.</p>
              )}
            </Panel>
          </div>

          <div className="mt-6">
            <CouponPanel coupons={data.coupons} />
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
