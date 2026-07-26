import { ArrowLeft, MapPin, ShieldCheck, ShoppingCart } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Alert, EmptyState, PageHeader, Skeleton } from '../components/ui';
import { useCart } from '../lib/cart-api';
import { formatPrice } from '../lib/format';
import { orderErrorMessage, stockConflictItems, useCheckout } from '../lib/order-api';
import { useAuthStore } from '../stores/auth-store';
import type { CheckoutInput } from '../types/order';

const phonePattern = /^(0\d{9,10}|\+84\d{9,10})$/;

export function CheckoutPage() {
  const cartQuery = useCart();
  const checkout = useCheckout();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const conflicts = stockConflictItems(checkout.error);
  const [form, setForm] = useState<CheckoutInput>({
    recipientName: user?.name ?? '',
    phone: '',
    addressLine: '',
    ward: '',
    district: '',
    city: '',
    note: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const cart = cartQuery.data;

  function set(field: keyof CheckoutInput, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (form.recipientName.trim().length < 2) {
      setFormError('Tên người nhận cần ít nhất 2 ký tự.');
      return;
    }
    if (!phonePattern.test(form.phone.trim())) {
      setFormError('Số điện thoại không hợp lệ (ví dụ 0901234567).');
      return;
    }
    if (form.addressLine.trim().length < 5) {
      setFormError('Địa chỉ cần ít nhất 5 ký tự.');
      return;
    }
    if (form.city.trim().length < 2) {
      setFormError('Vui lòng nhập tỉnh/thành phố.');
      return;
    }
    setFormError(null);
    checkout.mutate(
      {
        recipientName: form.recipientName.trim(),
        phone: form.phone.trim(),
        addressLine: form.addressLine.trim(),
        city: form.city.trim(),
        ...(form.ward?.trim() ? { ward: form.ward.trim() } : {}),
        ...(form.district?.trim() ? { district: form.district.trim() } : {}),
        ...(form.note?.trim() ? { note: form.note.trim() } : {}),
      },
      { onSuccess: (order) => navigate(`/orders/${order.id}`) },
    );
  }

  return (
    <AppShell width="xl">
      <PageHeader
        eyebrow="Bước cuối"
        title="Xác nhận đặt hàng"
        description="Kiểm tra sản phẩm và điền thông tin giao hàng."
        action={
          <Link className="btn-secondary btn-sm" to="/cart">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Quay lại giỏ hàng
          </Link>
        }
      />

      {cartQuery.isPending ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-64" />
        </div>
      ) : !cart?.items.length ? (
        <EmptyState
          icon={ShoppingCart}
          title="Giỏ hàng trống"
          description="Thêm sản phẩm vào giỏ trước khi đặt hàng."
          action={
            <Link className="btn-primary" to="/products">
              Xem sản phẩm
            </Link>
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <form className="card p-6" onSubmit={submit}>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
              Thông tin giao hàng
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="recipientName">
                  Người nhận
                </label>
                <input
                  className="field"
                  id="recipientName"
                  value={form.recipientName}
                  onChange={(event) => set('recipientName', event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="phone">
                  Số điện thoại
                </label>
                <input
                  className="field"
                  id="phone"
                  inputMode="tel"
                  placeholder="0901234567"
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="addressLine">
                  Địa chỉ
                </label>
                <input
                  className="field"
                  id="addressLine"
                  placeholder="Số nhà, tên đường"
                  value={form.addressLine}
                  onChange={(event) => set('addressLine', event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="ward">
                  Phường/Xã <span className="font-normal text-slate-400">(không bắt buộc)</span>
                </label>
                <input
                  className="field"
                  id="ward"
                  value={form.ward}
                  onChange={(event) => set('ward', event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="district">
                  Quận/Huyện <span className="font-normal text-slate-400">(không bắt buộc)</span>
                </label>
                <input
                  className="field"
                  id="district"
                  value={form.district}
                  onChange={(event) => set('district', event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="city">
                  Tỉnh/Thành phố
                </label>
                <input
                  className="field"
                  id="city"
                  value={form.city}
                  onChange={(event) => set('city', event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="note">
                  Ghi chú <span className="font-normal text-slate-400">(không bắt buộc)</span>
                </label>
                <textarea
                  className="field"
                  id="note"
                  rows={2}
                  value={form.note}
                  onChange={(event) => set('note', event.target.value)}
                />
              </div>
            </div>

            {formError && (
              <div className="mt-4">
                <Alert>{formError}</Alert>
              </div>
            )}

            {checkout.isError && (
              <div className="mt-4">
                <Alert>
                  <p>{orderErrorMessage(checkout.error)}</p>
                  {conflicts.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5">
                      {conflicts.map((item) => (
                        <li key={item.productName}>
                          {item.productName}: yêu cầu {item.requested}, còn {item.available}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link className="mt-2 inline-block font-semibold underline underline-offset-2" to="/cart">
                    Quay lại giỏ hàng để điều chỉnh
                  </Link>
                </Alert>
              </div>
            )}

            <button className="btn-primary btn-lg mt-6 w-full" disabled={checkout.isPending}>
              {checkout.isPending ? 'Đang xử lý...' : 'Xác nhận đặt hàng'}
            </button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Thông tin giao hàng được lưu riêng cho đơn này
            </p>
          </form>

          <aside className="card p-6 lg:sticky lg:top-24">
            <h2 className="font-semibold text-slate-900">Đơn hàng của bạn</h2>
            <ul className="mt-4 divide-y divide-slate-100">
              {cart.items.map((item) => (
                <li className="flex justify-between gap-4 py-3 text-sm" key={item.id}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">
                      {item.product.name}
                    </span>
                    <span className="text-slate-500">Số lượng: {item.quantity}</span>
                  </span>
                  <span className="whitespace-nowrap font-semibold text-slate-900">
                    {formatPrice(item.subtotal)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
              <span className="font-semibold text-slate-900">Tổng cộng</span>
              <span className="text-xl font-bold text-slate-900">
                {formatPrice(cart.totalAmount)}
              </span>
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
