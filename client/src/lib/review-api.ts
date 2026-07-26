import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Review, ReviewListResponse } from '../types/catalog';
import { useAuthStore } from '../stores/auth-store';
import { apiJson, apiVoid } from './api-client';

const REVIEWS_KEY = ['reviews'] as const;
const MY_REVIEW_KEY = ['my-review'] as const;
export const REVIEW_PAGE_SIZE = 10;

export function getReviews(productId: string, page: number): Promise<ReviewListResponse> {
  const query = new URLSearchParams({ page: String(page), limit: String(REVIEW_PAGE_SIZE) });
  return apiJson<ReviewListResponse>(`/api/products/${encodeURIComponent(productId)}/reviews?${query.toString()}`);
}
export const getMyReview = (productId: string) => apiJson<Review | null>(`/api/products/${encodeURIComponent(productId)}/reviews/mine`);
export const createReview = (input: { productId: string; rating: number; comment?: string }) =>
  apiJson<Review>(`/api/products/${encodeURIComponent(input.productId)}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: input.rating, ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}) }),
  });
export const deleteReview = (id: string) => apiVoid(`/api/reviews/${encodeURIComponent(id)}`, { method: 'DELETE' });

export function useReviews(productId: string, page = 1) {
  return useQuery({ queryKey: [...REVIEWS_KEY, productId, page], queryFn: () => getReviews(productId, page), enabled: Boolean(productId) });
}

/** Independent of paging, so the form stays hidden even when the review is on a later page. */
export function useMyReview(productId: string) {
  const loggedIn = useAuthStore((state) => Boolean(state.user && state.tokens));
  return useQuery({ queryKey: [...MY_REVIEW_KEY, productId], queryFn: () => getMyReview(productId), enabled: loggedIn && Boolean(productId) });
}

function useInvalidateReviews(productId: string) {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: [...REVIEWS_KEY, productId] }),
    client.invalidateQueries({ queryKey: [...MY_REVIEW_KEY, productId] }),
    client.invalidateQueries({ queryKey: ['product', productId] }),
    client.invalidateQueries({ queryKey: ['products'] }),
  ]);
}
export function useCreateReview(productId: string) { const invalidate = useInvalidateReviews(productId); return useMutation({ mutationFn: createReview, onSuccess: invalidate }); }
export function useDeleteReview(productId: string) { const invalidate = useInvalidateReviews(productId); return useMutation({ mutationFn: deleteReview, onSuccess: invalidate }); }

export function reviewErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Không thể gửi đánh giá.';
  try {
    const body = JSON.parse(error.message) as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Không thể gửi đánh giá.';
  } catch {
    return error.message;
  }
}
