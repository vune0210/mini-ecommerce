import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminReview, AdminReviewListResponse, AdminReviewQuery, ModerateReviewInput } from '../types/review-admin';
import { apiJson, apiVoid } from './api-client';

const adminReviewsKey = ['admin-reviews'] as const;
export const ADMIN_REVIEW_PAGE_SIZE = 20;

export function getAdminReviews(params: AdminReviewQuery & { limit: number }): Promise<AdminReviewListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit), sort: params.sort });
  if (params.productId) query.set('productId', params.productId);
  if (params.isHidden) query.set('isHidden', params.isHidden);
  if (params.rating) query.set('rating', params.rating);
  // Sending withComment=false would not narrow anything server-side; omit it.
  if (params.withComment) query.set('withComment', 'true');
  return apiJson<AdminReviewListResponse>(`/api/admin/reviews?${query.toString()}`);
}

export const setReviewVisibility = ({ id, isHidden }: ModerateReviewInput) =>
  apiJson<AdminReview>(`/api/reviews/${encodeURIComponent(id)}/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isHidden }),
  });
/** Answers 204 — apiVoid, since parsing an empty body would throw. */
export const deleteAdminReview = (id: string) => apiVoid(`/api/reviews/${encodeURIComponent(id)}`, { method: 'DELETE' });

function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) { const client = useQueryClient(); return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))); }

/**
 * Hiding or deleting a review moves the product's average and review count, so
 * the storefront caches must go too: the review list, the author's own-review
 * lookup, the product detail and the product listings.
 */
const moderationKeys = [adminReviewsKey, ['reviews'], ['my-review'], ['product'], ['products']] as const;

/** placeholderData keeps the current page on screen while a filter change loads. */
export function useAdminReviews(params: AdminReviewQuery) { return useQuery({ queryKey: [...adminReviewsKey, params], queryFn: () => getAdminReviews({ ...params, limit: ADMIN_REVIEW_PAGE_SIZE }), placeholderData: keepPreviousData }); }
export function useSetReviewVisibility() { const invalidate = useInvalidate(moderationKeys); return useMutation({ mutationFn: setReviewVisibility, onSuccess: invalidate }); }
export function useDeleteAdminReview() { const invalidate = useInvalidate(moderationKeys); return useMutation({ mutationFn: deleteAdminReview, onSuccess: invalidate }); }

export function adminReviewError(error: unknown): string { if (!(error instanceof Error)) return 'Thao tác không thành công.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Thao tác không thành công.'; } catch { return error.message; } }
