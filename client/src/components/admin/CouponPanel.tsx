import { TicketPercent } from 'lucide-react';
import { Panel } from '../ui';
import { formatPrice } from '../../lib/format';
import type { AdminStats } from '../../types/admin';

/** What the discount programme actually cost, straight from the redemption ledger. */
export function CouponPanel({ coupons }: { coupons: AdminStats['coupons'] }) {
  const average =
    coupons.redemptions > 0 ? Number(coupons.discountTotal) / coupons.redemptions : 0;

  return (
    <Panel title="Chi phí mã giảm giá" icon={TicketPercent}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Lượt sử dụng</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {coupons.redemptions}
          </p>
        </div>
        <div className="rounded-xl bg-rose-50 p-4">
          <p className="text-xs font-medium text-rose-600">Tiền đã giảm</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rose-700">
            {formatPrice(coupons.discountTotal)}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Bình quân mỗi lượt</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {formatPrice(average)}
          </p>
        </div>
      </div>

      {coupons.topCodes.length ? (
        <ul className="mt-4 divide-y divide-slate-50 border-t border-slate-100">
          {coupons.topCodes.map((code) => (
            <li className="flex items-center justify-between gap-4 py-2.5" key={code.code}>
              <span className="flex min-w-0 items-center gap-2.5">
                <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                  {code.code}
                </code>
                <span className="text-xs text-slate-400">{code.redemptions} lượt</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                −{formatPrice(code.discount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-500">
          Chưa có mã giảm giá nào được dùng trong khoảng thời gian này.
        </p>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Số liệu đọc từ sổ ghi nhận lượt dùng mã, không phải từ tiền giảm ghi trên đơn: khi một đơn
        bị huỷ, lượt dùng được hoàn lại và không còn bị tính vào ngân sách khuyến mãi. Mã được xếp
        theo số tiền đã giảm, không theo số lượt dùng.
      </p>
    </Panel>
  );
}
