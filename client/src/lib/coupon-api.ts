import { useMutation, useQuery } from '@tanstack/react-query';
import { apiJson } from './api-client';
import { useAuthStore } from '../stores/auth-store';
import { formatPrice } from './format';

export type CouponType = 'PERCENT' | 'FIXED';

/**
 * What the API is willing to tell a customer about a code. Usage counters and
 * limits are withheld server-side on purpose, so there is nothing here to show
 * "3 of 100 left" with.
 *
 * Declared here rather than in `src/types/**` because that folder belongs to
 * another workstream; the coupon contract has exactly one consumer.
 */
export type PublicCoupon = {
  code: string;
  description: string | null;
  type: CouponType;
  value: string;
  minSubtotal: string | null;
  maxDiscount: string | null;
  endsAt: string | null;
};

/** `payable` is subtotal − discount; shipping is added at checkout, not here. */
export type CouponPreview = {
  coupon: PublicCoupon;
  subtotal: string;
  discount: string;
  payable: string;
};

/** A published code plus what it would actually save on the current cart. */
export type CouponOffer = { coupon: PublicCoupon; discount: string };

/**
 * Only codes the shop deliberately published, already filtered server-side to
 * the ones this cart qualifies for and sorted best-first. A targeted code the
 * customer was mailed never appears here — that is what makes it targeted.
 *
 * A query rather than a mutation, unlike `preview`: this is a read of what is
 * on offer, and it changes only when the cart does.
 */
export const getAvailableCoupons = () =>
  apiJson<CouponOffer[]>('/api/coupons/available');

export function useAvailableCoupons(enabled = true) {
  const signedIn = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  return useQuery({
    queryKey: ['coupons', 'available'],
    queryFn: getAvailableCoupons,
    enabled: enabled && signedIn,
  });
}

export const previewCoupon = (code: string) =>
  apiJson<CouponPreview>('/api/coupons/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  });

/**
 * A dry run, not a reservation: nothing is held, and checkout re-validates the
 * code inside its own transaction. Hence a mutation rather than a query — there
 * is no cached answer worth trusting a second time.
 */
export function usePreviewCoupon() {
  return useMutation({ mutationFn: previewCoupon });
}

/**
 * The refusal reason is the whole point of `/coupons/preview` — "Coupon has
 * expired" and "Order subtotal must be at least X" send the customer to
 * completely different next actions — so the server's sentence is passed
 * through verbatim instead of being flattened into one local string.
 */
export function couponErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Không kiểm tra được mã giảm giá.';
  try {
    const body = JSON.parse(error.message) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    return body.message ?? 'Không kiểm tra được mã giảm giá.';
  } catch {
    return error.message;
  }
}

/** "10%" or "50.000 ₫" — how much the code takes off, before any cap. */
export function couponValueLabel(coupon: PublicCoupon): string {
  return coupon.type === 'PERCENT'
    ? `Giảm ${Number(coupon.value)}%`
    : `Giảm ${formatPrice(coupon.value)}`;
}
