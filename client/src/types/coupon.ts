/** Mirrors the server `CouponType` enum. */
export type CouponType = 'PERCENT' | 'FIXED';

/**
 * Mirrors the server `Coupon` entity as it comes back from the admin endpoints.
 * Money columns are decimal(10,2) in MySQL and therefore arrive as strings,
 * never as numbers; the counters are plain ints.
 */
export type Coupon = {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  /** Percentage (1-100) when type is PERCENT, otherwise a money amount. */
  value: string;
  minSubtotal: string | null;
  /** Caps a PERCENT discount. The server ignores it for FIXED. */
  maxDiscount: string | null;
  startsAt: string | null;
  /** Exclusive bound: a coupon ending at midnight is already dead at midnight. */
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  perUserLimit: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CouponListResponse = { items: Coupon[]; total: number; page: number; limit: number };

export type CouponQuery = {
  page: number;
  search: string;
  type: '' | CouponType;
  isActive: '' | 'true' | 'false';
};

/**
 * Body of POST /api/admin/coupons. Optional fields are omitted, never sent as
 * null: the DTO marks them `@IsOptional()`, so a null slips past validation and
 * then blows up on `.toFixed(2)` inside the service.
 */
export type CouponInput = {
  code: string;
  description?: string;
  type: CouponType;
  value: number;
  minSubtotal?: number;
  maxDiscount?: number;
  startsAt?: string;
  endsAt?: string;
  usageLimit?: number;
  perUserLimit?: number;
  isActive?: boolean;
};

/** PATCH accepts everything except `code`, which is immutable by design. */
export type CouponUpdateInput = Omit<Partial<CouponInput>, 'code'>;

/**
 * Why a code is or is not working right now. `isActive` alone cannot answer
 * that: a live-looking coupon may simply be out of budget or out of window.
 */
export type CouponState = 'DISABLED' | 'SCHEDULED' | 'EXPIRED' | 'EXHAUSTED' | 'RUNNING';
