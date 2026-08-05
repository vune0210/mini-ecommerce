import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyReview, Review, ReviewListResponse, ReviewSort } from '../types/catalog';
import { useAuthStore } from '../stores/auth-store';
import { apiJson, apiVoid } from './api-client';

const REVIEWS_KEY = ['reviews'] as const;
const MY_REVIEW_KEY = ['my-review'] as const;
export const REVIEW_PAGE_SIZE = 10;

export type ReviewFilters = {
  sort: ReviewSort;
  /** Exact star filter, not a floor — the histogram rows map onto it 1:1. */
  rating?: number;
  withComment?: boolean;
};

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = { sort: 'newest' };

export function getReviews(
  productId: string,
  page: number,
  filters: ReviewFilters = DEFAULT_REVIEW_FILTERS,
): Promise<ReviewListResponse> {
  const query = new URLSearchParams({ page: String(page), limit: String(REVIEW_PAGE_SIZE) });
  if (filters.sort !== 'newest') query.set('sort', filters.sort);
  if (filters.rating) query.set('rating', String(filters.rating));
  if (filters.withComment) query.set('withComment', 'true');
  return apiJson<ReviewListResponse>(`/api/products/${encodeURIComponent(productId)}/reviews?${query.toString()}`);
}
/** Carries isHidden, so a moderated author is told rather than left guessing. */
export const getMyReview = (productId: string) => apiJson<MyReview | null>(`/api/products/${encodeURIComponent(productId)}/reviews/mine`);
export const createReview = (input: { productId: string; rating: number; comment?: string }) =>
  apiJson<Review>(`/api/products/${encodeURIComponent(input.productId)}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: input.rating, ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}) }),
  });
export const deleteReview = (id: string) => apiVoid(`/api/reviews/${encodeURIComponent(id)}`, { method: 'DELETE' });
/** Both halves answer 200 with the updated review, and both are idempotent. */
export const voteHelpful = (id: string) => apiJson<Review>(`/api/reviews/${encodeURIComponent(id)}/helpful`, { method: 'POST' });
export const unvoteHelpful = (id: string) => apiJson<Review>(`/api/reviews/${encodeURIComponent(id)}/helpful`, { method: 'DELETE' });

export function useReviews(productId: string, page = 1, filters: ReviewFilters = DEFAULT_REVIEW_FILTERS) {
  return useQuery({
    queryKey: [...REVIEWS_KEY, productId, page, filters],
    queryFn: () => getReviews(productId, page, filters),
    enabled: Boolean(productId),
  });
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

/**
 * A helpful vote moves `helpfulCount` and nothing else, so only the review list
 * is refetched — busting the product caches would repaint the whole page for a
 * number that never touches the rating.
 *
 * The list endpoint does not report which reviews the caller has already voted
 * on, so the pressed state cannot be read back from the server; the caller owns
 * that memory. Both directions are idempotent, so a stale local guess costs at
 * most a redundant request, never a double count.
 */
export function useHelpfulVote(productId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, helpful }: { reviewId: string; helpful: boolean }) =>
      helpful ? voteHelpful(reviewId) : unvoteHelpful(reviewId),
    onSuccess: () => client.invalidateQueries({ queryKey: [...REVIEWS_KEY, productId] }),
  });
}

export function reviewErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Không thể gửi đánh giá.';
  try {
    const body = JSON.parse(error.message) as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Không thể gửi đánh giá.';
  } catch {
    return error.message;
  }
}
