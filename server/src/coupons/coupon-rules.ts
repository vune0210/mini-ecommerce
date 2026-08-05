import { Coupon, CouponType } from './entities/coupon.entity';

/** Codes are case- and whitespace-insensitive at the door, exact in storage. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

type DiscountRule = Pick<Coupon, 'type' | 'value' | 'maxDiscount'>;

/**
 * Money is decimal(10,2) in MySQL and a string in the entity, so every step
 * rounds to cents before the next one. Multiplying first and rounding once at
 * the end lets a percentage coupon produce a sub-cent discount that then fails
 * to reconcile with `total = subtotal - discount + shipping`.
 *
 * The result is clamped to the subtotal: a fixed 100k coupon on a 60k cart
 * discounts 60k, never 100k, because a negative order total is not a refund.
 */
export function couponDiscount(
  coupon: DiscountRule,
  subtotal: string | number,
): string {
  const base = Number(subtotal);
  if (!Number.isFinite(base) || base <= 0) return '0.00';
  const raw =
    coupon.type === CouponType.PERCENT
      ? (base * Number(coupon.value)) / 100
      : Number(coupon.value);
  const capped =
    coupon.maxDiscount !== null && coupon.maxDiscount !== undefined
      ? Math.min(raw, Number(coupon.maxDiscount))
      : raw;
  return Math.max(0, Math.min(round2(capped), round2(base))).toFixed(2);
}

function round2(value: number): number {
  // The +Number.EPSILON nudge keeps 1.005 from rounding down through the
  // binary representation of the literal.
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type CouponContext = {
  now: Date;
  subtotal: string | number;
  /** How many times this customer has already redeemed the code. */
  userRedemptions: number;
};

type ValidatableCoupon = Pick<
  Coupon,
  | 'isActive'
  | 'startsAt'
  | 'endsAt'
  | 'usageLimit'
  | 'usageCount'
  | 'perUserLimit'
  | 'minSubtotal'
>;

/**
 * Returns the reason a coupon cannot be applied, or null when it can.
 *
 * A message rather than a boolean because "why not" is the whole value at the
 * checkout screen — "Coupon has expired" and "Order subtotal must be at least
 * X" send the customer to completely different next actions.
 *
 * Order is deliberate: existence problems (inactive, not started, expired)
 * outrank budget problems, which outrank the cart-value problem the customer
 * can actually fix by buying more.
 */
export function couponRejection(
  coupon: ValidatableCoupon,
  context: CouponContext,
): string | null {
  if (!coupon.isActive) return 'Coupon is not available';
  if (coupon.startsAt && coupon.startsAt.getTime() > context.now.getTime())
    return 'Coupon is not active yet';
  // The end bound is exclusive: a coupon ending at midnight is dead at midnight.
  if (coupon.endsAt && coupon.endsAt.getTime() <= context.now.getTime())
    return 'Coupon has expired';
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)
    return 'Coupon has reached its usage limit';
  if (
    coupon.perUserLimit !== null &&
    context.userRedemptions >= coupon.perUserLimit
  )
    return 'You have already used this coupon';
  if (
    coupon.minSubtotal !== null &&
    Number(context.subtotal) < Number(coupon.minSubtotal)
  )
    return `Order subtotal must be at least ${Number(coupon.minSubtotal).toFixed(2)} to use this coupon`;
  return null;
}

export type CouponDefinition = {
  type?: CouponType;
  value?: number;
  startsAt?: string;
  endsAt?: string;
  maxDiscount?: number;
};

/**
 * Cross-field checks that no single-property validator can express. Returns the
 * problem, or null when the definition is coherent.
 *
 * Kept out of class-validator decorators on purpose: a custom constraint that
 * reaches across properties has to re-implement partial-update semantics, and
 * the PATCH path — where `type` may be absent and must fall back to the stored
 * row — is exactly where that goes wrong.
 */
export function couponDefinitionProblem(
  definition: CouponDefinition,
): string | null {
  if (
    definition.type === CouponType.PERCENT &&
    definition.value !== undefined &&
    definition.value > 100
  )
    return 'A PERCENT coupon cannot exceed 100';
  if (
    definition.startsAt &&
    definition.endsAt &&
    new Date(definition.startsAt).getTime() >=
      new Date(definition.endsAt).getTime()
  )
    return 'startsAt must be before endsAt';
  return null;
}

export type PublicCoupon = {
  code: string;
  description: string | null;
  type: CouponType;
  value: string;
  minSubtotal: string | null;
  maxDiscount: string | null;
  endsAt: Date | null;
};

/**
 * What a customer may see about a coupon. Usage counters and limits are
 * withheld on purpose — publishing "3 of 100 used" turns a promo code into a
 * scarcity signal and a scraping target.
 */
export function serializeCoupon(coupon: Coupon): PublicCoupon {
  return {
    code: coupon.code,
    description: coupon.description,
    type: coupon.type,
    value: coupon.value,
    minSubtotal: coupon.minSubtotal,
    maxDiscount: coupon.maxDiscount,
    endsAt: coupon.endsAt,
  };
}
