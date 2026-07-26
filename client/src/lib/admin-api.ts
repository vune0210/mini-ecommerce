import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, Product } from '../types/catalog';
import type { AdminOrder, AdminOrderListResponse, AdminStats, CategoryInput, ProductInput, UpdateOrderStatusInput } from '../types/admin';
import type { OrderStatus } from '../types/order';
import { apiJson, apiVoid } from './api-client';
const productsKey = ['products'] as const; const categoriesKey = ['categories'] as const; const adminOrdersKey = ['admin-orders'] as const; const adminStatsKey = ['admin-stats'] as const;
export const createCategory = (input: CategoryInput) => apiJson<Category>('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
export const updateCategory = (input: CategoryInput & { id: string }) => apiJson<Category>(`/api/categories/${encodeURIComponent(input.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.name, slug: input.slug }) });
export const deleteCategory = (id: string) => apiVoid(`/api/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const createProduct = (input: ProductInput) => apiJson<Product>('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
// `id` must stay out of the body: the API runs forbidNonWhitelisted and rejects it.
export const updateProduct = ({ id, ...body }: Partial<ProductInput> & { id: string }) => apiJson<Product>(`/api/products/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const deleteProduct = (id: string) => apiVoid(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const ADMIN_ORDER_PAGE_SIZE = 20;
export function getAdminOrders(params: { page: number; limit: number; status: '' | OrderStatus; search: string }): Promise<AdminOrderListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.status) query.set('status', params.status);
  if (params.search.trim()) query.set('search', params.search.trim());
  return apiJson<AdminOrderListResponse>(`/api/orders/admin/all?${query.toString()}`);
}
export const getAdminStats = () => apiJson<AdminStats>('/api/admin/stats');
export const updateOrderStatus = ({ id, status }: UpdateOrderStatusInput) => apiJson<AdminOrder>(`/api/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) { const client = useQueryClient(); return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))); }
export function useCreateCategory() { const invalidate = useInvalidate([categoriesKey]); return useMutation({ mutationFn: createCategory, onSuccess: invalidate }); }
export function useUpdateCategory() { const invalidate = useInvalidate([categoriesKey]); return useMutation({ mutationFn: updateCategory, onSuccess: invalidate }); }
export function useDeleteCategory() { const invalidate = useInvalidate([categoriesKey]); return useMutation({ mutationFn: deleteCategory, onSuccess: invalidate }); }
export function useCreateProduct() { const invalidate = useInvalidate([productsKey]); return useMutation({ mutationFn: createProduct, onSuccess: invalidate }); }
export function useUpdateProduct() { const invalidate = useInvalidate([productsKey]); return useMutation({ mutationFn: updateProduct, onSuccess: invalidate }); }
export function useDeleteProduct() { const invalidate = useInvalidate([productsKey]); return useMutation({ mutationFn: deleteProduct, onSuccess: invalidate }); }
export function useAdminOrders(params: { page: number; status: '' | OrderStatus; search: string }) { return useQuery({ queryKey: [...adminOrdersKey, params], queryFn: () => getAdminOrders({ ...params, limit: ADMIN_ORDER_PAGE_SIZE }) }); }
export function useAdminStats() { return useQuery({ queryKey: adminStatsKey, queryFn: getAdminStats }); }
export function useUpdateOrderStatus() { const invalidate = useInvalidate([adminOrdersKey, adminStatsKey, ['orders']]); return useMutation({ mutationFn: updateOrderStatus, onSuccess: invalidate }); }
export function adminError(error: unknown): string { if (!(error instanceof Error)) return 'Thao tác không thành công.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Thao tác không thành công.'; } catch { return error.message; } }
