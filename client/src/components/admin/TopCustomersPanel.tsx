import { Crown } from 'lucide-react';
import { Panel } from '../ui';
import { formatPrice } from '../../lib/format';
import type { AdminStats } from '../../types/admin';

type Row = AdminStats['topCustomers'][number];

/** Highest-spending customers over countable orders in the selected window. */
export function TopCustomersPanel({ rows }: { rows: Row[] }) {
  return (
    <Panel title="Khách hàng chi tiêu nhiều nhất" icon={Crown} bare>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3 font-semibold">Khách hàng</th>
                <th className="whitespace-nowrap px-5 py-3 text-right font-semibold">Đơn</th>
                <th className="whitespace-nowrap px-5 py-3 text-right font-semibold">Đã chi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold uppercase text-brand-700">
                        {row.name.charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{row.name}</p>
                        <p className="truncate text-xs text-slate-400">{row.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-600">{row.orders}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                    {formatPrice(row.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
            Chỉ tính đơn đã thanh toán trở lên; đơn chờ xử lý và đơn đã huỷ không được cộng vào.
          </p>
        </div>
      ) : (
        <p className="p-5 text-sm text-slate-500">Chưa có khách hàng nào phát sinh đơn.</p>
      )}
    </Panel>
  );
}
