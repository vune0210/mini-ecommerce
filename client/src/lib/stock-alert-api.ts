import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, apiVoid } from './api-client';
import { useAuthStore } from '../stores/auth-store';
import type { StockAlert } from '../types/stock-alert';

const STOCK_ALERTS_KEY = ['stock-alerts'];

export const getStockAlerts = () => apiJson<StockAlert[]>('/api/stock-alerts');

export const subscribeToStock = (productId: string) =>
  apiJson<StockAlert[]>(
    `/api/products/${encodeURIComponent(productId)}/stock-alert`,
    { method: 'POST' },
  );

export const unsubscribeFromStock = (productId: string) =>
  apiVoid(`/api/products/${encodeURIComponent(productId)}/stock-alert`, {
    method: 'DELETE',
  });

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: STOCK_ALERTS_KEY });
  };
}

/** Disabled without a token, or the query spins forever for a visitor. */
export function useStockAlerts() {
  const enabled = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  return useQuery({
    queryKey: STOCK_ALERTS_KEY,
    queryFn: getStockAlerts,
    enabled,
  });
}

/** One cache entry serves every button on a page via `select`. */
export function useIsWatchingStock(productId: string) {
  const enabled = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  return useQuery({
    queryKey: STOCK_ALERTS_KEY,
    queryFn: getStockAlerts,
    enabled,
    select: (alerts) => alerts.some((alert) => alert.productId === productId),
  });
}

export function useSubscribeToStock() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: subscribeToStock, onSuccess: invalidate });
}

export function useUnsubscribeFromStock() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: unsubscribeFromStock,
    onSuccess: invalidate,
  });
}

export function stockAlertError(error: unknown): string {
  if (!(error instanceof Error)) return 'Không thực hiện được thao tác.';
  try {
    const body = JSON.parse(error.message) as { message?: string | string[] };
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;
    return message ?? 'Không thực hiện được thao tác.';
  } catch {
    return error.message;
  }
}
