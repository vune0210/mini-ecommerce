import type { LucideIcon } from 'lucide-react';
import { Boxes, Package, TrendingUp, TriangleAlert, Users, Wallet } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { Alert, Badge, PageHeader, Panel, Skeleton } from '../components/ui';
import { useAdminStats } from '../lib/admin-api';
import { formatPrice, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, ORDER_STATUSES } from '../lib/format';

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
  const stats = useAdminStats();
  const data = stats.data;

  return (
    <AdminShell>
      <PageHeader
        eyebrow="Tổng quan"
        title="Bảng điều khiển"
        description="Số liệu bán hàng và tình trạng kho theo thời gian thực."
      />

      {stats.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="h-32" key={index} />
          ))}
        </div>
      ) : stats.isError ? (
        <Alert>Không thể tải số liệu thống kê.</Alert>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label="Doanh thu (trừ đơn huỷ)"
              value={formatPrice(data.revenue.net)}
              hint={`Đã hoàn tất: ${formatPrice(data.revenue.completed)}`}
              icon={Wallet}
              tone="bg-emerald-50 text-emerald-600"
            />
            <Tile
              label="Tổng đơn hàng"
              value={String(data.orders.total)}
              hint={`Giá trị TB: ${formatPrice(data.orders.averageOrderValue)}`}
              icon={TrendingUp}
              tone="bg-brand-50 text-brand-600"
            />
            <Tile
              label="Khách hàng"
              value={String(data.customers)}
              icon={Users}
              tone="bg-sky-50 text-sky-600"
            />
            <Tile
              label="Sản phẩm"
              value={String(data.products.total)}
              hint={`Hết hàng: ${data.products.outOfStock}`}
              icon={Boxes}
              tone="bg-violet-50 text-violet-600"
            />
          </div>

          <Panel className="mt-6" title="Đơn theo trạng thái">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
        </>
      ) : null}
    </AdminShell>
  );
}
