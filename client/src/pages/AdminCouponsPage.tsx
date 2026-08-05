import { Pencil, Plus, Power, PowerOff, Search, Ticket, TicketPercent, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { Alert, Badge, EmptyState, PageHeader, Pagination, Panel, Skeleton } from '../components/ui';
import {
  ADMIN_COUPON_PAGE_SIZE,
  COUPON_STATE_HINT,
  COUPON_STATE_LABEL,
  COUPON_STATE_TONE,
  COUPON_TYPE_LABEL,
  couponError,
  couponState,
  isCouponConflict,
  useAdminCoupons,
  useCreateCoupon,
  useDeleteCoupon,
  useUpdateCoupon,
} from '../lib/coupon-admin-api';
import { formatDateTime, formatPrice } from '../lib/format';
import type { Coupon, CouponType, CouponUpdateInput } from '../types/coupon';

/** Same pattern the API enforces, checked here so a typo does not cost a round trip. */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

type FormState = {
  code: string;
  description: string;
  type: CouponType;
  value: string;
  minSubtotal: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perUserLimit: string;
  isActive: boolean;
};

const blank: FormState = {
  code: '',
  description: '',
  type: 'PERCENT',
  value: '',
  minSubtotal: '',
  maxDiscount: '',
  startsAt: '',
  endsAt: '',
  usageLimit: '',
  perUserLimit: '',
  isActive: true,
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** `datetime-local` speaks local wall-clock time; the API speaks ISO instants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toNumber(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** `10.00` from a decimal column reads as `10%`, not `10.00%`. */
const percentLabel = (value: string): string => `${Number(value)}%`;

export function AdminCouponsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | CouponType>('');
  const [isActive, setIsActive] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState>(blank);
  const [editing, setEditing] = useState<Coupon | null>(null);
  // Two channels on purpose: a rejected form belongs next to the fields that
  // caused it, a failed row action belongs next to the table.
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ coupon: Coupon; message: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const coupons = useAdminCoupons({ page, search, type, isActive });
  const create = useCreateCoupon();
  const update = useUpdateCoupon();
  const destroy = useDeleteCoupon();
  const totalPages = coupons.data
    ? Math.max(1, Math.ceil(coupons.data.total / ADMIN_COUPON_PAGE_SIZE))
    : 1;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput.trim() === search) return;
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, searchInput]);

  useEffect(() => {
    // The live state is read off the clock, so it has to age on its own: a code
    // ending at midnight must flip to "hết hạn" without anyone reloading.
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function set(patch: Partial<FormState>): void {
    setForm((current) => ({ ...current, ...patch }));
  }

  function reset(): void {
    setEditing(null);
    setForm(blank);
    setFormError(null);
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    setConflict(null);
    const code = form.code.trim().toUpperCase();
    if (!editing && !CODE_PATTERN.test(code)) {
      setFormError(
        'Mã gồm 3-40 ký tự chữ HOA, số, gạch ngang hoặc gạch dưới, bắt đầu bằng chữ hoặc số.',
      );
      return;
    }
    const value = toNumber(form.value);
    if (value === undefined || value <= 0) {
      setFormError('Nhập giá trị lớn hơn 0.');
      return;
    }
    // Cross-field rules (percent over 100, startsAt not before endsAt) are left
    // to the API on purpose: its wording is the wording the admin needs to see.
    setFormError(null);

    const minSubtotal = toNumber(form.minSubtotal);
    const maxDiscount = toNumber(form.maxDiscount);
    const usageLimit = toNumber(form.usageLimit);
    const perUserLimit = toNumber(form.perUserLimit);
    const startsAt = toIso(form.startsAt);
    const endsAt = toIso(form.endsAt);
    // Blank optional fields are omitted, never sent as null: the DTO marks them
    // `@IsOptional()`, so a null passes validation and then fails inside the
    // service. The trade-off is that a stored limit cannot be cleared, which the
    // form says out loud.
    const optional: CouponUpdateInput = {
      ...(minSubtotal !== undefined ? { minSubtotal } : {}),
      // maxDiscount caps a percentage; on a FIXED coupon the rule never reads it,
      // so storing one would only mislead the next admin.
      ...(form.type === 'PERCENT' && maxDiscount !== undefined ? { maxDiscount } : {}),
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {}),
      ...(usageLimit !== undefined ? { usageLimit } : {}),
      ...(perUserLimit !== undefined ? { perUserLimit } : {}),
    };
    const callbacks = {
      onSuccess: () => {
        setEditing(null);
        setForm(blank);
      },
      onError: (reason: unknown) => setFormError(couponError(reason)),
    };

    if (editing) {
      update.mutate(
        {
          id: editing.id,
          type: form.type,
          value,
          // An empty string is meaningful here: the API turns it back into null.
          description: form.description.trim(),
          isActive: form.isActive,
          ...optional,
        },
        callbacks,
      );
      return;
    }
    create.mutate(
      {
        code,
        type: form.type,
        value,
        isActive: form.isActive,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...optional,
      },
      callbacks,
    );
  }

  function edit(coupon: Coupon): void {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      description: coupon.description ?? '',
      type: coupon.type,
      value: String(Number(coupon.value)),
      minSubtotal: coupon.minSubtotal === null ? '' : String(Number(coupon.minSubtotal)),
      maxDiscount: coupon.maxDiscount === null ? '' : String(Number(coupon.maxDiscount)),
      startsAt: toLocalInput(coupon.startsAt),
      endsAt: toLocalInput(coupon.endsAt),
      usageLimit: coupon.usageLimit === null ? '' : String(coupon.usageLimit),
      perUserLimit: coupon.perUserLimit === null ? '' : String(coupon.perUserLimit),
      isActive: coupon.isActive,
    });
    setFormError(null);
    setConflict(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setActive(coupon: Coupon, next: boolean): void {
    setListError(null);
    setConflict(null);
    update.mutate(
      { id: coupon.id, isActive: next },
      { onError: (reason) => setListError(couponError(reason)) },
    );
  }

  function toggleActive(coupon: Coupon): void {
    if (
      coupon.isActive &&
      !window.confirm(`Tắt mã “${coupon.code}”? Mọi giỏ hàng dùng mã này sẽ bị từ chối ngay.`)
    )
      return;
    setActive(coupon, !coupon.isActive);
  }

  function remove(coupon: Coupon): void {
    setListError(null);
    setConflict(null);
    if (!window.confirm(`Xoá vĩnh viễn mã “${coupon.code}”?`)) return;
    destroy.mutate(coupon.id, {
      onSuccess: () => {
        if (editing?.id === coupon.id) reset();
      },
      onError: (reason) => {
        // 409 means the code is already in the redemption ledger. Deleting it
        // would leave past orders unexplainable, so the way forward is to turn
        // it off — offered right here instead of as advice.
        if (isCouponConflict(reason)) {
          setConflict({ coupon, message: couponError(reason) });
          return;
        }
        setListError(couponError(reason));
      },
    });
  }

  const saving = create.isPending || update.isPending;

  return (
    <AdminShell>
      <PageHeader
        title="Mã giảm giá"
        description="Tạo và điều chỉnh mã khuyến mãi. Trạng thái hiển thị là trạng thái thực tế khách gặp, tính từ khung thời gian và số lượt đã dùng."
        action={coupons.data && <Badge tone="slate">{coupons.data.total} mã</Badge>}
      />

      <Panel
        title={editing ? `Sửa mã: ${editing.code}` : 'Tạo mã mới'}
        icon={editing ? Pencil : Plus}
        action={
          editing && (
            <button className="btn-ghost btn-sm" type="button" onClick={reset}>
              <X className="h-4 w-4" aria-hidden />
              Huỷ
            </button>
          )
        }
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="coupon-code">
              Mã
            </label>
            <input
              className="field font-mono uppercase"
              id="coupon-code"
              placeholder="SALE10"
              maxLength={40}
              disabled={Boolean(editing)}
              value={form.code}
              onChange={(event) => set({ code: event.target.value })}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {editing
                ? 'Mã không đổi được sau khi tạo: đổi tên sẽ làm mọi bản in và mọi lượt đã đổi mất dấu. Hãy tắt mã này và tạo mã mới.'
                : '3-40 ký tự chữ, số, gạch ngang hoặc gạch dưới. Tự động viết HOA.'}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="coupon-type">
              Loại giảm giá
            </label>
            <select
              className="field"
              id="coupon-type"
              value={form.type}
              onChange={(event) => set({ type: event.target.value as CouponType })}
            >
              <option value="PERCENT">{COUPON_TYPE_LABEL.PERCENT}</option>
              <option value="FIXED">{COUPON_TYPE_LABEL.FIXED}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="coupon-value">
              {form.type === 'PERCENT' ? 'Giá trị (%)' : 'Giá trị (VND)'}
            </label>
            <input
              className="field"
              id="coupon-value"
              type="number"
              min="0.01"
              step="0.01"
              max={form.type === 'PERCENT' ? 100 : undefined}
              placeholder={form.type === 'PERCENT' ? '10' : '50000'}
              value={form.value}
              onChange={(event) => set({ value: event.target.value })}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {form.type === 'PERCENT'
                ? 'Phần trăm trên tạm tính, tối đa 100.'
                : 'Số tiền trừ thẳng, không bao giờ vượt quá tạm tính của đơn.'}
            </p>
          </div>
          <div>
            {form.type === 'PERCENT' ? (
              <>
                <label className="label" htmlFor="coupon-max-discount">
                  Giảm tối đa (VND)
                </label>
                <input
                  className="field"
                  id="coupon-max-discount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Không giới hạn"
                  value={form.maxDiscount}
                  onChange={(event) => set({ maxDiscount: event.target.value })}
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  Trần cho mã phần trăm: một giỏ hàng lớn không thể rút cạn ngân sách khuyến mãi.
                </p>
              </>
            ) : (
              <>
                <p className="label">Giảm tối đa</p>
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500">
                  Không áp dụng cho mã số tiền cố định — mức giảm đã cố định sẵn.
                </p>
              </>
            )}
          </div>
          <div>
            <label className="label" htmlFor="coupon-min-subtotal">
              Tạm tính tối thiểu (VND)
            </label>
            <input
              className="field"
              id="coupon-min-subtotal"
              type="number"
              min="0"
              step="0.01"
              placeholder="Không yêu cầu"
              value={form.minSubtotal}
              onChange={(event) => set({ minSubtotal: event.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="coupon-per-user">
              Giới hạn mỗi khách (lượt)
            </label>
            <input
              className="field"
              id="coupon-per-user"
              type="number"
              min="1"
              step="1"
              placeholder="Không giới hạn"
              value={form.perUserLimit}
              onChange={(event) => set({ perUserLimit: event.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="coupon-starts-at">
              Bắt đầu
            </label>
            <input
              className="field"
              id="coupon-starts-at"
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => set({ startsAt: event.target.value })}
            />
            <p className="mt-1.5 text-xs text-slate-400">Để trống nghĩa là có hiệu lực ngay.</p>
          </div>
          <div>
            <label className="label" htmlFor="coupon-ends-at">
              Kết thúc
            </label>
            <input
              className="field"
              id="coupon-ends-at"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => set({ endsAt: event.target.value })}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Mốc này <strong className="font-semibold text-slate-500">không được tính</strong>: mã
              đặt kết thúc 00:00 đã chết ngay tại 00:00. Để trống nghĩa là không hết hạn.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="coupon-usage-limit">
              Tổng số lượt (toàn hệ thống)
            </label>
            <input
              className="field"
              id="coupon-usage-limit"
              type="number"
              min="1"
              step="1"
              placeholder="Không giới hạn"
              value={form.usageLimit}
              onChange={(event) => set({ usageLimit: event.target.value })}
            />
            {editing && (
              <p className="mt-1.5 text-xs text-slate-400">Đã dùng {editing.usageCount} lượt.</p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="coupon-description">
              Mô tả
            </label>
            <input
              className="field"
              id="coupon-description"
              maxLength={255}
              placeholder="Giảm 10% cho đơn đầu tiên"
              value={form.description}
              onChange={(event) => set({ description: event.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
              <input
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => set({ isActive: event.target.checked })}
              />
              Bật mã
            </label>
          </div>
          {editing && (
            <div className="sm:col-span-2">
              <Alert tone="info">
                Để trống một giới hạn khi sửa nghĩa là <strong>giữ nguyên</strong> giá trị đang lưu —
                API không có cách gỡ bỏ một giới hạn đã đặt. Chỉ riêng mô tả là xoá được bằng cách
                để trống.
              </Alert>
            </div>
          )}
          {formError && (
            <div className="sm:col-span-2">
              <Alert>{formError}</Alert>
            </div>
          )}
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={saving}>
              {editing ? 'Lưu thay đổi' : 'Tạo mã'}
            </button>
          </div>
        </form>
      </Panel>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            className="field pl-10"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm mã hoặc mô tả..."
            aria-label="Tìm mã giảm giá"
          />
        </div>
        <select
          className="field"
          value={type}
          onChange={(event) => {
            setType(event.target.value as '' | CouponType);
            setPage(1);
          }}
          aria-label="Lọc theo loại"
        >
          <option value="">Tất cả loại</option>
          <option value="PERCENT">{COUPON_TYPE_LABEL.PERCENT}</option>
          <option value="FIXED">{COUPON_TYPE_LABEL.FIXED}</option>
        </select>
        <select
          className="field"
          value={isActive}
          onChange={(event) => {
            setIsActive(event.target.value as '' | 'true' | 'false');
            setPage(1);
          }}
          aria-label="Lọc theo trạng thái bật/tắt"
        >
          <option value="">Bật và tắt</option>
          <option value="true">Đang bật</option>
          <option value="false">Đã tắt</option>
        </select>
      </div>

      {conflict && (
        <div className="mt-4">
          <Alert tone="warning">
            <p className="font-semibold">Không xoá được mã “{conflict.coupon.code}”</p>
            <p className="mt-1">{conflict.message}</p>
            <p className="mt-1">
              Mã đã được đổi {conflict.coupon.usageCount} lượt. Sổ đổi mã là dữ liệu kế toán của các
              đơn đã phát sinh, xoá đi thì những đơn đó không còn giải thích được. Hãy tắt mã để
              ngừng phát hành mà vẫn giữ lịch sử.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {conflict.coupon.isActive && (
                <button
                  className="btn-secondary btn-sm"
                  type="button"
                  disabled={update.isPending}
                  onClick={() => setActive(conflict.coupon, false)}
                >
                  <PowerOff className="h-3.5 w-3.5" aria-hidden />
                  Tắt mã này
                </button>
              )}
              <button className="btn-ghost btn-sm" type="button" onClick={() => setConflict(null)}>
                Đóng
              </button>
            </div>
          </Alert>
        </div>
      )}

      {listError && (
        <div className="mt-4">
          <Alert>{listError}</Alert>
        </div>
      )}

      <div className="mt-4">
        {coupons.isPending ? (
          <Skeleton className="h-64" />
        ) : coupons.isError ? (
          <Alert>Không thể tải danh sách mã giảm giá.</Alert>
        ) : !coupons.data.items.length ? (
          <EmptyState
            icon={Ticket}
            title="Không có mã nào khớp bộ lọc"
            description="Thử xoá bộ lọc, hoặc tạo mã mới bằng biểu mẫu phía trên."
          />
        ) : (
          <>
            <Panel bare>
              <div
                className={`overflow-x-auto transition-opacity ${coupons.isFetching ? 'opacity-60' : ''}`}
              >
                <table className="w-full min-w-[1080px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                      <th className="px-5 py-3 font-semibold">Mã</th>
                      <th className="px-5 py-3 font-semibold">Giảm giá</th>
                      <th className="px-5 py-3 font-semibold">Điều kiện</th>
                      <th className="px-5 py-3 text-center font-semibold">Lượt dùng</th>
                      <th className="px-5 py-3 font-semibold" title="Mốc kết thúc không được tính">
                        Hiệu lực
                      </th>
                      <th className="px-5 py-3 font-semibold">Trạng thái</th>
                      <th className="px-5 py-3 text-right font-semibold">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {coupons.data.items.map((coupon) => {
                      const state = couponState(coupon, now);
                      return (
                        <tr className="transition-colors hover:bg-slate-50/60" key={coupon.id}>
                          <td className="px-5 py-3">
                            <p className="font-mono font-semibold text-slate-900">{coupon.code}</p>
                            {coupon.description && (
                              <p className="mt-0.5 max-w-[22rem] truncate text-xs text-slate-400">
                                {coupon.description}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium tabular-nums text-slate-900">
                                {coupon.type === 'PERCENT'
                                  ? percentLabel(coupon.value)
                                  : formatPrice(coupon.value)}
                              </span>
                              <Badge tone={coupon.type === 'PERCENT' ? 'violet' : 'sky'}>
                                {COUPON_TYPE_LABEL[coupon.type]}
                              </Badge>
                              {/* maxDiscount only caps a percentage; showing it on a
                                  FIXED coupon would imply a rule that never runs. */}
                              {coupon.type === 'PERCENT' && coupon.maxDiscount !== null && (
                                <span className="text-xs text-slate-500">
                                  Tối đa {formatPrice(coupon.maxDiscount)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-500">
                            {coupon.minSubtotal === null && coupon.perUserLimit === null ? (
                              <span className="text-slate-400">Không điều kiện</span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {coupon.minSubtotal !== null && (
                                  <span>Đơn từ {formatPrice(coupon.minSubtotal)}</span>
                                )}
                                {coupon.perUserLimit !== null && (
                                  <span>Mỗi khách {coupon.perUserLimit} lượt</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className="font-medium tabular-nums text-slate-700">
                              {coupon.usageCount}
                            </span>
                            <span className="text-slate-400">
                              {' / '}
                              {coupon.usageLimit ?? '∞'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-500">
                            <div className="flex flex-col gap-0.5">
                              <span>
                                {coupon.startsAt
                                  ? `Từ ${formatDateTime(coupon.startsAt)}`
                                  : 'Từ lúc tạo'}
                              </span>
                              <span>
                                {coupon.endsAt
                                  ? `Đến trước ${formatDateTime(coupon.endsAt)}`
                                  : 'Không hết hạn'}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <Badge tone={COUPON_STATE_TONE[state]}>
                              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                              {COUPON_STATE_LABEL[state]}
                            </Badge>
                            <p className="mt-1 max-w-[13rem] text-xs text-slate-400">
                              {COUPON_STATE_HINT[state]}
                            </p>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                className="btn-secondary btn-sm"
                                type="button"
                                disabled={update.isPending}
                                onClick={() => toggleActive(coupon)}
                              >
                                {coupon.isActive ? (
                                  <>
                                    <PowerOff className="h-3.5 w-3.5" aria-hidden />
                                    Tắt
                                  </>
                                ) : (
                                  <>
                                    <Power className="h-3.5 w-3.5" aria-hidden />
                                    Bật
                                  </>
                                )}
                              </button>
                              <button
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                                type="button"
                                onClick={() => edit(coupon)}
                                aria-label={`Sửa mã ${coupon.code}`}
                              >
                                <Pencil className="h-4 w-4" aria-hidden />
                              </button>
                              <button
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                type="button"
                                disabled={destroy.isPending}
                                onClick={() => remove(coupon)}
                                aria-label={`Xoá mã ${coupon.code}`}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              summary={`${coupons.data.total} mã`}
            />
          </>
        )}
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-slate-400">
        <TicketPercent className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Mã đã có lượt đổi chỉ tắt được, không xoá được — lịch sử đổi mã là dữ liệu kế toán của những
        đơn đã phát sinh.
      </p>
    </AdminShell>
  );
}
