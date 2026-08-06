import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Banknote,
  Landmark,
  MapPin,
  ShieldCheck,
  ShoppingCart,
  Tag,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { AppShell } from '../components/AppShell';
import { Alert, Badge, EmptyState, PageHeader, Skeleton } from '../components/ui';
import { blockedCartItems, useCart } from '../lib/cart-api';
import type { CouponPreview } from '../lib/coupon-api';
import {
  couponErrorMessage,
  couponValueLabel,
  useAvailableCoupons,
  usePreviewCoupon,
} from '../lib/coupon-api';
import { formatPrice, shippingAddress } from '../lib/format';
import {
  conflictMessage,
  orderErrorMessage,
  stockConflictItems,
  useAddresses,
  useCheckout,
  useStripeSession,
} from '../lib/order-api';
import { useAuthStore } from '../stores/auth-store';
import type { CheckoutInput, PaymentMethod } from '../types/order';

const phonePattern = /^(0\d{9,10}|\+84\d{9,10})$/;

/**
 * `addressId` is the switch: naming a saved address makes the inline fields
 * irrelevant, which is exactly how the API validates it (`@ValidateIf`). The
 * inline branch keeps its per-field messages rather than collapsing into one
 * "thiếu thông tin giao hàng".
 */
const schema = z
  .object({
    addressId: z.string(),
    recipientName: z.string(),
    phone: z.string(),
    addressLine: z.string(),
    ward: z.string().max(100, 'Phường/Xã tối đa 100 ký tự.'),
    district: z.string().max(100, 'Quận/Huyện tối đa 100 ký tự.'),
    city: z.string(),
    note: z.string().max(500, 'Ghi chú tối đa 500 ký tự.'),
    paymentMethod: z.enum(['COD', 'BANK_TRANSFER', 'STRIPE']),
  })
  .superRefine((values, context) => {
    if (values.addressId) return;
    const custom = z.ZodIssueCode.custom;
    if (values.recipientName.trim().length < 2)
      context.addIssue({ code: custom, path: ['recipientName'], message: 'Tên người nhận cần ít nhất 2 ký tự.' });
    if (!phonePattern.test(values.phone.trim()))
      context.addIssue({ code: custom, path: ['phone'], message: 'Số điện thoại không hợp lệ (ví dụ 0901234567).' });
    if (values.addressLine.trim().length < 5)
      context.addIssue({ code: custom, path: ['addressLine'], message: 'Địa chỉ cần ít nhất 5 ký tự.' });
    if (values.city.trim().length < 2)
      context.addIssue({ code: custom, path: ['city'], message: 'Vui lòng nhập tỉnh/thành phố.' });
  });

type CheckoutForm = z.infer<typeof schema>;

const paymentOptions: Array<{ value: PaymentMethod; label: string; hint: string; icon: typeof Banknote }> = [
  {
    value: 'COD',
    label: 'Thanh toán khi nhận hàng (COD)',
    hint: 'Trả tiền mặt cho nhân viên giao hàng.',
    icon: Banknote,
  },
  {
    value: 'BANK_TRANSFER',
    label: 'Chuyển khoản ngân hàng',
    hint: 'Thông tin chuyển khoản sẽ được gửi sau khi đặt hàng.',
    icon: Landmark,
  },
  {
    value: 'STRIPE',
    label: 'Thanh toán thẻ qua Stripe',
    hint: 'Chuyển sang trang Stripe bảo mật để thanh toán. Có thể dùng Test Mode miễn phí.',
    icon: Wallet,
  },
];

function Field({
  id,
  label,
  optional,
  error,
  className = '',
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-slate-400"> (không bắt buộc)</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function CheckoutPage() {
  const cartQuery = useCart();
  const addressesQuery = useAddresses();
  const checkout = useCheckout();
  const stripeSession = useStripeSession();
  const couponPreview = usePreviewCoupon();
  // Only what the shop published and this cart already qualifies for; the
  // server does the filtering, so anything listed here will be accepted.
  const offers = useAvailableCoupons();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const conflicts = stockConflictItems(checkout.error);
  const [couponCode, setCouponCode] = useState('');
  const [applied, setApplied] = useState<CouponPreview | null>(null);
  const preselected = useRef(false);
  const cart = cartQuery.data;
  const addresses = addressesQuery.data ?? [];
  const blocked = blockedCartItems(cart);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CheckoutForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      addressId: '',
      recipientName: user?.name ?? '',
      phone: '',
      addressLine: '',
      ward: '',
      district: '',
      city: '',
      note: '',
      paymentMethod: 'COD',
    },
  });
  const addressId = watch('addressId');
  const paymentMethod = watch('paymentMethod');

  // The API returns the book default first; preselecting it once leaves the
  // customer free to switch without the effect snapping the choice back.
  useEffect(() => {
    const saved = addressesQuery.data;
    if (preselected.current || !saved?.length) return;
    preselected.current = true;
    setValue('addressId', (saved.find((address) => address.isDefault) ?? saved[0]).id);
  }, [addressesQuery.data, setValue]);

  // The preview was priced against the cart as it stood; a line changed since
  // then means the discount will be recomputed at checkout.
  const staleDiscount = applied !== null && cart !== undefined && applied.subtotal !== cart.totalAmount;
  const discount = applied ? Number(applied.discount) : 0;
  const payable = Math.max(0, Number(cart?.totalAmount ?? 0) - discount);

  function applyCoupon(): void {
    const code = couponCode.trim();
    if (!code) return;
    couponPreview.mutate(code, { onSuccess: setApplied });
  }

  function clearCoupon(): void {
    setApplied(null);
    setCouponCode('');
    couponPreview.reset();
  }

  function onSubmit(values: CheckoutForm): void {
    const input: CheckoutInput = {
      paymentMethod: values.paymentMethod,
      ...(values.note.trim() ? { note: values.note.trim() } : {}),
      ...(applied ? { couponCode: applied.coupon.code } : {}),
      ...(values.addressId
        ? { addressId: values.addressId }
        : {
            recipientName: values.recipientName.trim(),
            phone: values.phone.trim(),
            addressLine: values.addressLine.trim(),
            city: values.city.trim(),
            ...(values.ward.trim() ? { ward: values.ward.trim() } : {}),
            ...(values.district.trim() ? { district: values.district.trim() } : {}),
          }),
    };
    checkout.mutate(input, {
      onSuccess: (order) => {
        if (values.paymentMethod !== 'STRIPE') return navigate(`/orders/${order.id}`);
        stripeSession.mutate(order.id, {
          onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
          onError: () => navigate(`/orders/${order.id}`),
        });
      },
    });
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
          <form className="card p-6" onSubmit={handleSubmit(onSubmit)}>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
              Thông tin giao hàng
            </h2>

            {addressesQuery.isPending ? (
              <Skeleton className="mt-5 h-24" />
            ) : addresses.length > 0 ? (
              <div className="mt-5 space-y-2">
                {addresses.map((address) => (
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                      addressId === address.id
                        ? 'border-brand-500 bg-brand-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    key={address.id}
                  >
                    <input
                      className="mt-1 text-brand-600 focus:ring-brand-500"
                      type="radio"
                      value={address.id}
                      {...register('addressId')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {address.label ?? address.recipientName}
                        </span>
                        {address.isDefault && <Badge tone="brand">Mặc định</Badge>}
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-500">
                        {address.recipientName} · {address.phone}
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-600">
                        {shippingAddress(address)}
                      </span>
                    </span>
                  </label>
                ))}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${
                    addressId === '' ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    className="text-brand-600 focus:ring-brand-500"
                    type="radio"
                    value=""
                    {...register('addressId')}
                  />
                  <span className="font-medium text-slate-900">Giao tới địa chỉ khác</span>
                </label>
              </div>
            ) : (
              addressesQuery.isError && (
                <p className="mt-5 text-sm text-slate-500">
                  Không tải được sổ địa chỉ — bạn vẫn có thể nhập trực tiếp bên dưới.
                </p>
              )
            )}

            {/* Held back until the book has answered, so the fields do not
                appear only to be replaced by a preselected saved address. */}
            {addressId === '' && !addressesQuery.isPending && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field id="recipientName" label="Người nhận" error={errors.recipientName?.message}>
                  <input className="field" id="recipientName" maxLength={100} {...register('recipientName')} />
                </Field>
                <Field id="phone" label="Số điện thoại" error={errors.phone?.message}>
                  <input
                    className="field"
                    id="phone"
                    inputMode="tel"
                    placeholder="0901234567"
                    {...register('phone')}
                  />
                </Field>
                <Field
                  className="sm:col-span-2"
                  id="addressLine"
                  label="Địa chỉ"
                  error={errors.addressLine?.message}
                >
                  <input
                    className="field"
                    id="addressLine"
                    maxLength={255}
                    placeholder="Số nhà, tên đường"
                    {...register('addressLine')}
                  />
                </Field>
                <Field id="ward" label="Phường/Xã" optional error={errors.ward?.message}>
                  <input className="field" id="ward" maxLength={100} {...register('ward')} />
                </Field>
                <Field id="district" label="Quận/Huyện" optional error={errors.district?.message}>
                  <input className="field" id="district" maxLength={100} {...register('district')} />
                </Field>
                <Field
                  className="sm:col-span-2"
                  id="city"
                  label="Tỉnh/Thành phố"
                  error={errors.city?.message}
                >
                  <input className="field" id="city" maxLength={100} {...register('city')} />
                </Field>
              </div>
            )}

            <div className="mt-4">
              <Field id="note" label="Ghi chú" optional error={errors.note?.message}>
                <textarea className="field" id="note" rows={2} maxLength={500} {...register('note')} />
              </Field>
            </div>

            <h2 className="mt-8 flex items-center gap-2 font-semibold text-slate-900">
              <Wallet className="h-4 w-4 text-brand-600" aria-hidden />
              Phương thức thanh toán
            </h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {paymentOptions.map((option) => (
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                    paymentMethod === option.value
                      ? 'border-brand-500 bg-brand-50/50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  key={option.value}
                >
                  <input
                    className="mt-1 text-brand-600 focus:ring-brand-500"
                    type="radio"
                    value={option.value}
                    {...register('paymentMethod')}
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <option.icon className="h-4 w-4 text-slate-400" aria-hidden />
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-500">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {blocked.length > 0 && (
              <div className="mt-6">
                <Alert tone="warning">
                  <p className="font-semibold">
                    {blocked.length} sản phẩm trong giỏ không thể đặt hàng
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {blocked.map((item) => (
                      <li key={item.id}>{item.product.name}</li>
                    ))}
                  </ul>
                  <Link className="mt-2 inline-block font-semibold underline underline-offset-2" to="/cart">
                    Quay lại giỏ hàng để xử lý
                  </Link>
                </Alert>
              </div>
            )}

            {checkout.isError && (
              <div className="mt-4">
                <Alert>
                  <p>{orderErrorMessage(checkout.error)}</p>
                  {conflicts.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5">
                      {conflicts.map((item) => (
                        <li key={item.productId || item.productName}>{conflictMessage(item)}</li>
                      ))}
                    </ul>
                  )}
                  <Link className="mt-2 inline-block font-semibold underline underline-offset-2" to="/cart">
                    Quay lại giỏ hàng để điều chỉnh
                  </Link>
                  {applied && (
                    <button className="btn-secondary btn-sm mt-3" type="button" onClick={clearCoupon}>
                      Bỏ mã {applied.coupon.code} và thử lại
                    </button>
                  )}
                </Alert>
              </div>
            )}

            <button
              className="btn-primary btn-lg mt-6 w-full"
              disabled={checkout.isPending || blocked.length > 0}
              type="submit"
            >
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
                    {!item.available && (
                      <span className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                        <TriangleAlert className="h-3 w-3" aria-hidden />
                        Không thể đặt hàng
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap font-semibold text-slate-900">
                    {formatPrice(item.subtotal)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <label className="label" htmlFor="coupon">
                Mã giảm giá
              </label>
              {applied ? (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-semibold text-emerald-800">
                      <Tag className="h-3.5 w-3.5" aria-hidden />
                      {applied.coupon.code}
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-700">
                      {couponValueLabel(applied.coupon)} · tiết kiệm {formatPrice(applied.discount)}
                    </p>
                    {applied.coupon.description && (
                      <p className="mt-0.5 text-xs text-emerald-700">{applied.coupon.description}</p>
                    )}
                  </div>
                  <button
                    className="rounded-lg p-1.5 text-emerald-700 transition-colors hover:bg-emerald-100"
                    type="button"
                    onClick={clearCoupon}
                    aria-label="Bỏ mã giảm giá"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="field uppercase"
                    id="coupon"
                    maxLength={40}
                    placeholder="VD: SALE10"
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      // The coupon input lives inside the checkout form; Enter
                      // here means "check this code", not "place the order".
                      event.preventDefault();
                      applyCoupon();
                    }}
                  />
                  <button
                    className="btn-secondary shrink-0"
                    type="button"
                    disabled={!couponCode.trim() || couponPreview.isPending}
                    onClick={applyCoupon}
                  >
                    {couponPreview.isPending ? 'Đang kiểm tra...' : 'Áp dụng'}
                  </button>
                </div>
              )}

              {!applied && (offers.data?.length ?? 0) > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">
                    Mã đang có cho giỏ hàng này
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {offers.data?.map((offer) => (
                      <li key={offer.coupon.code}>
                        <button
                          className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                          type="button"
                          // Fills the field rather than applying silently: the
                          // customer still sees what was applied and why.
                          onClick={() => setCouponCode(offer.coupon.code)}
                          title={offer.coupon.description ?? undefined}
                        >
                          <Tag className="h-3 w-3" aria-hidden />
                          {offer.coupon.code}
                          <span className="font-normal text-brand-600">
                            −{formatPrice(offer.discount)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {couponPreview.isError && !applied && (
                <div className="mt-2">
                  <Alert>{couponErrorMessage(couponPreview.error)}</Alert>
                </div>
              )}
              {staleDiscount && (
                <div className="mt-2">
                  <Alert tone="warning">
                    Giỏ hàng đã thay đổi sau khi áp mã. Số tiền giảm sẽ được tính lại khi đặt hàng.
                  </Alert>
                </div>
              )}
            </div>

            <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Tạm tính</dt>
                <dd className="font-medium text-slate-900">{formatPrice(cart.totalAmount)}</dd>
              </div>
              {applied && (
                <div className="flex justify-between">
                  <dt className="text-emerald-700">Giảm giá ({applied.coupon.code})</dt>
                  <dd className="font-medium text-emerald-700">−{formatPrice(applied.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Phí vận chuyển</dt>
                <dd className="font-medium text-slate-500">Tính khi đặt hàng</dd>
              </div>
            </dl>
            <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
              <span className="font-semibold text-slate-900">Tạm tính sau giảm giá</span>
              <span className="text-xl font-bold text-slate-900">{formatPrice(payable)}</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Phí vận chuyển phụ thuộc vào giá trị đơn sau giảm giá và chỉ được chốt khi đơn hàng
              được tạo — tổng cuối cùng sẽ hiển thị ngay ở trang chi tiết đơn.
            </p>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
