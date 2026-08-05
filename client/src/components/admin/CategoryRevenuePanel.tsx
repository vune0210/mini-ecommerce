import { Layers } from 'lucide-react';
import { Panel } from '../ui';
import { formatPrice } from '../../lib/format';
import type { AdminStats } from '../../types/admin';

type Row = AdminStats['revenueByCategory'][number];

/**
 * Merchandise revenue per category, as a ranked share list.
 *
 * Deliberately not a second line chart: this is a part-to-whole comparison at a
 * single point in time, so length against a shared baseline reads faster than a
 * trend would, and every value is directly labelled rather than left to a tooltip.
 * One measure, one hue — bar colour carries magnitude, the row label carries
 * identity, so nothing depends on telling colours apart.
 */
export function CategoryRevenuePanel({ rows }: { rows: Row[] }) {
  const total = rows.reduce((sum, row) => sum + Number(row.revenue), 0);
  const largest = rows.reduce((max, row) => Math.max(max, Number(row.revenue)), 0);

  return (
    <Panel title="Doanh thu theo danh mục" icon={Layers}>
      {rows.length ? (
        <>
          <ol className="space-y-3.5">
            {rows.map((row) => {
              const revenue = Number(row.revenue);
              // Bars scale to the leader so the smallest slice stays visible;
              // the percentage beside it is always of the whole.
              const width = largest > 0 ? (revenue / largest) * 100 : 0;
              const share = total > 0 ? (revenue / total) * 100 : 0;
              return (
                <li key={row.categoryId ?? `deleted-${row.categoryName}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-slate-900">
                      {row.categoryId ? row.categoryName : 'Sản phẩm đã xoá'}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                      {formatPrice(row.revenue)}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
                    role="img"
                    aria-label={`${row.categoryName}: ${formatPrice(row.revenue)}, ${share.toFixed(1)}% doanh thu hàng`}
                  >
                    <div
                      className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-slate-400">
                    {share.toFixed(1)}% · {row.quantitySold} sản phẩm đã bán
                  </p>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
            Tính trên tiền hàng của các dòng đơn (chưa gồm phí vận chuyển và giảm giá), nên tổng ở
            đây khớp với “Tiền hàng” chứ không khớp với “Tiền thu về”.
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-500">Chưa có doanh thu nào trong khoảng thời gian này.</p>
      )}
    </Panel>
  );
}
