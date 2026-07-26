import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth-store';
import type { CheckoutInput, Order, OrderListResponse, OrderStatus } from '../types/order';
import { apiJson } from './api-client';

const ORDERS_KEY = ['orders'] as const;
const CART_KEY = ['cart'] as const;
export const ORDER_PAGE_SIZE = 10;
export const checkout = (input: CheckoutInput) => apiJson<Order>('/api/orders/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
export function getOrders(params: { page: number; limit: number; status: '' | OrderStatus }): Promise<OrderListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.status) query.set('status', params.status);
  return apiJson<OrderListResponse>(`/api/orders?${query.toString()}`);
}
export const getOrder = (id: string) => apiJson<Order>(`/api/orders/${encodeURIComponent(id)}`);
export const cancelOrder = (id: string) => apiJson<Order>(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: 'PATCH' });

function useLoggedIn() { return useAuthStore((state) => Boolean(state.user && state.tokens)); }
export function useOrders(params: { page: number; status: '' | OrderStatus }) { const enabled = useLoggedIn(); return useQuery({ queryKey: [...ORDERS_KEY, params], queryFn: () => getOrders({ ...params, limit: ORDER_PAGE_SIZE }), enabled }); }
export function useOrder(id: string) { const enabled = useLoggedIn(); return useQuery({ queryKey: [...ORDERS_KEY, id], queryFn: () => getOrder(id), enabled: enabled && Boolean(id) }); }
function useInvalidateOrders() { const client = useQueryClient(); return () => Promise.all([client.invalidateQueries({ queryKey: ORDERS_KEY }), client.invalidateQueries({ queryKey: CART_KEY })]); }
export function useCheckout() { const invalidate = useInvalidateOrders(); return useMutation({ mutationFn: checkout, onSuccess: invalidate }); }
export function useCancelOrder() { const invalidate = useInvalidateOrders(); return useMutation({ mutationFn: cancelOrder, onSuccess: invalidate }); }
export function orderErrorMessage(error: unknown): string { if (!(error instanceof Error)) return 'Không thể xử lý đơn hàng.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Không thể xử lý đơn hàng.'; } catch { return error.message; } }
export function stockConflictItems(error: unknown): Array<{ productName: string; requested: number; available: number }> { if (!(error instanceof Error)) return []; try { const body = JSON.parse(error.message) as { items?: Array<{ productName: string; requested: number; available: number }> }; return body.items ?? []; } catch { return []; } }
