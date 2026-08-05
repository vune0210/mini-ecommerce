import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Product, ProductListResponse } from '../types/catalog';
import type {
  StockAdjustmentInput,
  StockMovementListResponse,
  StockMovementQuery,
} from '../types/inventory';
import { apiJson } from './api-client';

const stockMovementsKey = ['stock-movements'] as const;
// Prefixed with 'products' on purpose: the products page invalidates ['products']
// after an edit, and prefix matching then refreshes this list too.
const adminProductsKey = ['products', 'admin'] as const;
const productsKey = ['products'] as const;
const adminStatsKey = ['admin-stats'] as const;

export const STOCK_MOVEMENT_PAGE_SIZE = 20;
/** The API caps `limit` at 100; the picker and the low-stock panel share one page. */
export const INVENTORY_PRODUCT_LIMIT = 100;

export function getStockMovements(
  params: StockMovementQuery & { limit: number },
): Promise<StockMovementListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.productId) query.set('productId', params.productId);
  if (params.reason) query.set('reason', params.reason);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  return apiJson<StockMovementListResponse>(`/api/admin/stock-movements?${query.toString()}`);
}

/** The staff catalogue: unpublished products included, so nothing hides from a stock count. */
export function getAdminProducts(params: { limit: number }): Promise<ProductListResponse> {
  const query = new URLSearchParams({ page: '1', limit: String(params.limit), sort: 'name_asc' });
  return apiJson<ProductListResponse>(`/api/admin/products?${query.toString()}`);
}

/**
 * `stock` is absolute — the level the product ends at. `PATCH /api/products/:id`
 * can write the same column, but only this route appends to the ledger.
 */
export const adjustStock = ({ id, stock, reason, note }: StockAdjustmentInput) =>
  apiJson<Product>(`/api/products/${encodeURIComponent(id)}/stock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note?.trim() ? { stock, reason, note: note.trim() } : { stock, reason }),
  });

function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) { const client = useQueryClient(); return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))); }

/** placeholderData keeps the previous page on screen while a filter change loads. */
export function useStockMovements(params: StockMovementQuery) { return useQuery({ queryKey: [...stockMovementsKey, params], queryFn: () => getStockMovements({ ...params, limit: STOCK_MOVEMENT_PAGE_SIZE }), placeholderData: keepPreviousData }); }
export function useInventoryProducts() { return useQuery({ queryKey: [...adminProductsKey, { limit: INVENTORY_PRODUCT_LIMIT }], queryFn: () => getAdminProducts({ limit: INVENTORY_PRODUCT_LIMIT }) }); }
/** A stock write moves the ledger, every product listing and the dashboard totals at once. */
export function useAdjustStock() { const invalidate = useInvalidate([stockMovementsKey, productsKey, ['product'], adminStatsKey]); return useMutation({ mutationFn: adjustStock, onSuccess: invalidate }); }

export function inventoryError(error: unknown): string { if (!(error instanceof Error)) return 'Thao tác không thành công.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Thao tác không thành công.'; } catch { return error.message; } }
