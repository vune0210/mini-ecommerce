import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Coupon,
  CouponInput,
  CouponListResponse,
  CouponQuery,
  CouponState,
  CouponUpdateInput,
} from '../types/coupon';
import { apiJson, apiVoid } from './api-client';
import type { StatusTone } from './format';

const adminCouponsKey = ['admin-coupons'] as const;
export const ADMIN_COUPON_PAGE_SIZE = 20;

export function getAdminCoupons(params: CouponQuery & { limit: number }): Promise<CouponListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search.trim()) query.set('search', params.search.trim());
  if (params.type) query.set('type', params.type);
  if (params.isActive) query.set('isActive', params.isActive);
  return apiJson<CouponListResponse>(`/api/admin/coupons?${query.toString()}`);
}
export const getAdminCoupon = (id: string) => apiJson<Coupon>(`/api/admin/coupons/${encodeURIComponent(id)}`);
export const createCoupon = (input: CouponInput) => apiJson<Coupon>('/api/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
// `id` must stay out of the body: the API runs forbidNonWhitelisted and rejects
// it — and `code` is not part of UpdateCouponDto at all, so it can never be sent.
export const updateCoupon = ({ id, ...body }: CouponUpdateInput & { id: string }) => apiJson<Coupon>(`/api/admin/coupons/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const deleteCoupon = (id: string) => apiVoid(`/api/admin/coupons/${encodeURIComponent(id)}`, { method: 'DELETE' });

function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) { const client = useQueryClient(); return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))); }
/** placeholderData keeps the previous page on screen while a filter change
 * loads — the table would otherwise collapse to a skeleton on every keystroke. */
export function useAdminCoupons(params: CouponQuery) { return useQuery({ queryKey: [...adminCouponsKey, params], queryFn: () => getAdminCoupons({ ...params, limit: ADMIN_COUPON_PAGE_SIZE }), placeholderData: keepPreviousData }); }
export function useCreateCoupon() { const invalidate = useInvalidate([adminCouponsKey]); return useMutation({ mutationFn: createCoupon, onSuccess: invalidate }); }
export function useUpdateCoupon() { const invalidate = useInvalidate([adminCouponsKey]); return useMutation({ mutationFn: updateCoupon, onSuccess: invalidate }); }
export function useDeleteCoupon() { const invalidate = useInvalidate([adminCouponsKey]); return useMutation({ mutationFn: deleteCoupon, onSuccess: invalidate }); }

/** Same unwrapping as `adminError` in admin-api: the API answers with a JSON
 * envelope whose `message` is a string for a thrown exception and an array when
 * class-validator rejected several fields at once. Shown verbatim on purpose —
 * "A PERCENT coupon cannot exceed 100" is the whole explanation. */
export function couponError(error: unknown): string { if (!(error instanceof Error)) return 'Thao tác không thành công.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Thao tác không thành công.'; } catch { return error.message; } }

/** True for the 409 the API returns when a coupon has already been redeemed:
 * the ledger is accounting history, so the row can only be deactivated. */
export function isCouponConflict(error: unknown): boolean { if (!(error instanceof Error)) return false; try { return (JSON.parse(error.message) as { statusCode?: number }).statusCode === 409; } catch { return false; } }

/**
 * Reproduces the server's `couponRejection` order — inactive, then not started,
 * then expired, then out of budget — so the badge always names the first reason
 * a customer would hit, not just whichever flag an admin happens to notice.
 */
export function couponState(coupon: Coupon, now: number): CouponState {
  if (!coupon.isActive) return 'DISABLED';
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return 'SCHEDULED';
  // Exclusive end bound, matching the server's `endsAt <= now` check.
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() <= now) return 'EXPIRED';
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) return 'EXHAUSTED';
  return 'RUNNING';
}

export const COUPON_STATE_LABEL: Record<CouponState, string> = {
  DISABLED: 'Đã tắt',
  SCHEDULED: 'Chưa bắt đầu',
  EXPIRED: 'Hết hạn',
  EXHAUSTED: 'Hết lượt',
  RUNNING: 'Đang chạy',
};

export const COUPON_STATE_TONE: Record<CouponState, StatusTone | 'slate'> = {
  DISABLED: 'slate',
  SCHEDULED: 'sky',
  EXPIRED: 'rose',
  EXHAUSTED: 'amber',
  RUNNING: 'emerald',
};

/** Why the code is refused, in the customer's terms — the badge says *what*,
 * this says *what to do about it*. */
export const COUPON_STATE_HINT: Record<CouponState, string> = {
  DISABLED: 'Mã đang tắt nên bị từ chối ở mọi giỏ hàng.',
  SCHEDULED: 'Mã chưa tới thời điểm bắt đầu.',
  EXPIRED: 'Đã qua thời điểm kết thúc (mốc kết thúc không được tính).',
  EXHAUSTED: 'Đã dùng hết tổng số lượt cho phép.',
  RUNNING: 'Khách có thể dùng mã này.',
};

export const COUPON_TYPE_LABEL: Record<'PERCENT' | 'FIXED', string> = {
  PERCENT: 'Phần trăm',
  FIXED: 'Số tiền cố định',
};
