import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth-store';
import type { OrderStatusEvent } from '../types/admin';
import type {
  CheckoutConflictItem,
  CheckoutInput,
  Order,
  OrderListResponse,
  OrderStatus,
  PaymentMethod,
} from '../types/order';
import { apiJson } from './api-client';

const ORDERS_KEY = ['orders'] as const;
const CART_KEY = ['cart'] as const;
const ADDRESSES_KEY = ['addresses'] as const;
export const ORDER_PAGE_SIZE = 10;

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  COD: 'Thanh toán khi nhận hàng (COD)',
  BANK_TRANSFER: 'Chuyển khoản ngân hàng',
  STRIPE: 'Thẻ quốc tế qua Stripe',
};
export const createStripeSession = (orderId: string) => apiJson<{ redirectUrl: string }>(`/api/payments/orders/${encodeURIComponent(orderId)}/stripe-session`, { method: 'POST' });

/**
 * A saved destination from the customer's address book. Kept here rather than
 * in `src/types/**` — that folder belongs to another workstream — and the only
 * screen that reads it is checkout.
 */
export type SavedAddress = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  addressLine: string;
  ward: string | null;
  district: string | null;
  city: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};
/** Already sorted default-first by the API, which is the order a picker wants. */
export const getAddresses = () => apiJson<SavedAddress[]>('/api/addresses');
export const checkout = (input: CheckoutInput) => apiJson<Order>('/api/orders/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
export function getOrders(params: { page: number; limit: number; status: '' | OrderStatus }): Promise<OrderListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.status) query.set('status', params.status);
  return apiJson<OrderListResponse>(`/api/orders?${query.toString()}`);
}
export const getOrder = (id: string) => apiJson<Order>(`/api/orders/${encodeURIComponent(id)}`);
export const getOrderHistory = (id: string) => apiJson<OrderStatusEvent[]>(`/api/orders/${encodeURIComponent(id)}/history`);
export const cancelOrder = ({ id, note }: { id: string; note?: string }) => apiJson<Order>(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}) });

function useLoggedIn() { return useAuthStore((state) => Boolean(state.user && state.tokens)); }
export function useOrders(params: { page: number; status: '' | OrderStatus }) { const enabled = useLoggedIn(); return useQuery({ queryKey: [...ORDERS_KEY, params], queryFn: () => getOrders({ ...params, limit: ORDER_PAGE_SIZE }), enabled }); }
export function useOrder(id: string) { const enabled = useLoggedIn(); return useQuery({ queryKey: [...ORDERS_KEY, id], queryFn: () => getOrder(id), enabled: enabled && Boolean(id) }); }
export function useOrderHistory(id: string) { const enabled = useLoggedIn(); return useQuery({ queryKey: ['order-history', id], queryFn: () => getOrderHistory(id), enabled: enabled && Boolean(id) }); }
export function useAddresses() { const enabled = useLoggedIn(); return useQuery({ queryKey: ADDRESSES_KEY, queryFn: getAddresses, enabled }); }
function useInvalidateOrders() { const client = useQueryClient(); return () => Promise.all([client.invalidateQueries({ queryKey: ORDERS_KEY }), client.invalidateQueries({ queryKey: CART_KEY }), client.invalidateQueries({ queryKey: ['order-history'] })]); }
export function useCheckout() { const invalidate = useInvalidateOrders(); return useMutation({ mutationFn: checkout, onSuccess: invalidate }); }
export function useStripeSession() { return useMutation({ mutationFn: createStripeSession }); }
export function useCancelOrder() { const invalidate = useInvalidateOrders(); return useMutation({ mutationFn: cancelOrder, onSuccess: invalidate }); }
export function orderErrorMessage(error: unknown): string { if (!(error instanceof Error)) return 'Không thể xử lý đơn hàng.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Không thể xử lý đơn hàng.'; } catch { return error.message; } }
/**
 * The lines a 409 refused, each with the reason attached. `reason` defaults to
 * `insufficient-stock` so a response from an older server — which reported a
 * pulled product as `available: 0` — still renders instead of blanking out.
 */
export function stockConflictItems(error: unknown): CheckoutConflictItem[] {
  if (!(error instanceof Error)) return [];
  try {
    const body = JSON.parse(error.message) as { items?: Array<Partial<CheckoutConflictItem>> };
    return (body.items ?? []).map((item) => ({
      productId: item.productId ?? '',
      productName: item.productName ?? '',
      requested: item.requested ?? 0,
      available: item.available ?? 0,
      reason: item.reason === 'unavailable' ? 'unavailable' : 'insufficient-stock',
    }));
  } catch {
    return [];
  }
}

/**
 * "No longer sold" and "only 2 left" are different problems: one line has to
 * leave the cart, the other only needs a smaller number.
 */
export function conflictMessage(item: CheckoutConflictItem): string {
  return item.reason === 'unavailable'
    ? `${item.productName}: sản phẩm không còn được bán, vui lòng xoá khỏi giỏ hàng.`
    : `${item.productName}: bạn đặt ${item.requested}, chỉ còn ${item.available} trong kho.`;
}
