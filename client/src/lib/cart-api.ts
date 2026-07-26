import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth-store';
import type { Cart } from '../types/cart';
import { apiJson } from './api-client';

const CART_QUERY_KEY = ['cart'] as const;
export const getCart = () => apiJson<Cart>('/api/cart');
export const addCartItem = (input: { productId: string; quantity: number }) => apiJson<Cart>('/api/cart/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
export const updateCartItem = (input: { itemId: string; quantity: number }) => apiJson<Cart>(`/api/cart/items/${encodeURIComponent(input.itemId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: input.quantity }) });
export const removeCartItem = (itemId: string) => apiJson<Cart>(`/api/cart/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });

export function useCart() {
  const userId = useAuthStore((state) => state.user?.id);
  const hasTokens = useAuthStore((state) => Boolean(state.tokens));
  return useQuery({ queryKey: [...CART_QUERY_KEY, userId], queryFn: getCart, enabled: Boolean(userId && hasTokens) });
}

function useInvalidateCart() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: CART_QUERY_KEY });
}
export function useAddToCart() { const invalidate = useInvalidateCart(); return useMutation({ mutationFn: addCartItem, onSuccess: invalidate }); }
export function useUpdateCartItem() { const invalidate = useInvalidateCart(); return useMutation({ mutationFn: updateCartItem, onSuccess: invalidate }); }
export function useRemoveCartItem() { const invalidate = useInvalidateCart(); return useMutation({ mutationFn: removeCartItem, onSuccess: invalidate }); }

export function cartErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Không thể cập nhật giỏ hàng.';
  try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Không thể cập nhật giỏ hàng.'; } catch { return error.message; }
}
