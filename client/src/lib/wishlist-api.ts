import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth-store';
import type { Cart } from '../types/cart';
import type { WishlistEntry } from '../types/wishlist';
import { apiJson, apiVoid } from './api-client';

const wishlistKey = ['wishlist'] as const;
// Mirrors the key cart-api registers, so moving a product refreshes the nav badge.
const cartKey = ['cart'] as const;

export const getWishlist = () => apiJson<WishlistEntry[]>('/api/wishlist');
/** Idempotent on the server — saving twice is a no-op, not an error. */
export const addToWishlist = (productId: string) => apiJson<WishlistEntry[]>('/api/wishlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId }) });
export const removeFromWishlist = (productId: string) => apiVoid(`/api/wishlist/${encodeURIComponent(productId)}`, { method: 'DELETE' });
export const moveWishlistToCart = (input: { productId: string; quantity: number }) => apiJson<Cart>(`/api/wishlist/${encodeURIComponent(input.productId)}/move-to-cart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: input.quantity }) });

export function useWishlist() {
  const userId = useAuthStore((state) => state.user?.id);
  const hasTokens = useAuthStore((state) => Boolean(state.tokens));
  return useQuery({ queryKey: [...wishlistKey, userId], queryFn: getWishlist, enabled: Boolean(userId && hasTokens) });
}

/**
 * The heart on a product card only needs one bit of the list, so the rows are
 * selected down to a boolean against the same cache entry: one request feeds
 * every button on the page, and saving a product re-renders only the button
 * whose answer actually changed.
 */
export function useIsWishlisted(productId: string) {
  const userId = useAuthStore((state) => state.user?.id);
  const hasTokens = useAuthStore((state) => Boolean(state.tokens));
  return useQuery({
    queryKey: [...wishlistKey, userId],
    queryFn: getWishlist,
    enabled: Boolean(userId && hasTokens),
    select: (entries: WishlistEntry[]) => entries.some((entry) => entry.product.id === productId),
  });
}

function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) { const client = useQueryClient(); return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))); }
export function useAddToWishlist() { const invalidate = useInvalidate([wishlistKey]); return useMutation({ mutationFn: addToWishlist, onSuccess: invalidate }); }
export function useRemoveFromWishlist() { const invalidate = useInvalidate([wishlistKey]); return useMutation({ mutationFn: removeFromWishlist, onSuccess: invalidate }); }
/**
 * Refetches on success only, and never removes the row by hand: a stock failure
 * deliberately leaves the product saved, so an optimistic removal would drop it
 * from the UI while the server still holds it. Both keys are busted because the
 * move changes the cart as well as the wishlist.
 */
export function useMoveWishlistToCart() { const invalidate = useInvalidate([wishlistKey, cartKey]); return useMutation({ mutationFn: moveWishlistToCart, onSuccess: invalidate }); }

export function wishlistErrorMessage(error: unknown): string { if (!(error instanceof Error)) return 'Không thể cập nhật danh sách yêu thích.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Không thể cập nhật danh sách yêu thích.'; } catch { return error.message; } }
