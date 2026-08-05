import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth-store';
import type { Cart, CartItem } from '../types/cart';
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

/**
 * Why a line came back `available: false`. The API reports one flag, but the
 * three causes need three different buttons: a pulled product can only be
 * removed, while a short one just needs a smaller quantity.
 */
export type CartItemIssue = {
  kind: 'unpublished' | 'sold-out' | 'insufficient-stock';
  label: string;
  hint: string;
  /** The largest quantity that would make the line checkable, 0 when none would. */
  maxQuantity: number;
};

export function cartItemIssue(item: CartItem): CartItemIssue | null {
  if (item.available) return null;
  if (!item.product.isActive)
    return { kind: 'unpublished', label: 'Ngừng kinh doanh', hint: 'Sản phẩm không còn được bán. Hãy xoá khỏi giỏ hàng để tiếp tục.', maxQuantity: 0 };
  if (item.product.stock <= 0)
    return { kind: 'sold-out', label: 'Hết hàng', hint: 'Sản phẩm đã hết hàng. Hãy xoá khỏi giỏ hàng để tiếp tục.', maxQuantity: 0 };
  return { kind: 'insufficient-stock', label: `Chỉ còn ${item.product.stock}`, hint: `Bạn đang đặt ${item.quantity} nhưng kho chỉ còn ${item.product.stock}.`, maxQuantity: item.product.stock };
}

/** Lines that would make a checkout fail; never dropped, always shown. */
export const blockedCartItems = (cart: Cart | undefined): CartItem[] => cart?.items.filter((item) => !item.available) ?? [];

export function cartErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Không thể cập nhật giỏ hàng.';
  try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Không thể cập nhật giỏ hàng.'; } catch { return error.message; }
}
