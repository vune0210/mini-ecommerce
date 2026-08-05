import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, CategoryNode, Product, ProductListResponse } from '../types/catalog';
import type { AdminOrder, AdminOrderListResponse, AdminStats, AdminUser, AdminUserListResponse, AdminUserQuery, CategoryInput, ExportKind, ExportQuery, ProductInput, StatsQuery, UpdateOrderStatusInput } from '../types/admin';
import type { UserRole } from '../types/auth';
import type { OrderStatus } from '../types/order';
import { apiJson, apiVoid } from './api-client';
import { downloadFile } from './download';
const productsKey = ['products'] as const; const categoriesKey = ['categories'] as const; const adminOrdersKey = ['admin-orders'] as const; const adminStatsKey = ['admin-stats'] as const; const adminUsersKey = ['admin-users'] as const;
export const createCategory = (input: CategoryInput) => apiJson<Category>('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
// `parentId` is sent even when null: that is how a subcategory is promoted back
// to the root — omitting the key would leave the current parent in place.
export const updateCategory = (input: CategoryInput & { id: string }) => apiJson<Category>(`/api/categories/${encodeURIComponent(input.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.name, slug: input.slug, parentId: input.parentId ?? null }) });
export const getCategoryTree = () => apiJson<CategoryNode[]>('/api/categories/tree');
export const deleteCategory = (id: string) => apiVoid(`/api/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const createProduct = (input: ProductInput) => apiJson<Product>('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
// `id` must stay out of the body: the API runs forbidNonWhitelisted and rejects it.
// `sku` widens to null because that is the only way to clear one — an empty
// string fails the server's format check, and omitting the key keeps the old value.
export const updateProduct = ({ id, ...body }: Partial<Omit<ProductInput, 'sku'>> & { id: string; sku?: string | null }) => apiJson<Product>(`/api/products/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const deleteProduct = (id: string) => apiVoid(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const ADMIN_ORDER_PAGE_SIZE = 20;
export const ADMIN_USER_PAGE_SIZE = 20;
export const ADMIN_PRODUCT_PAGE_SIZE = 20;

/** Filters of the staff catalogue view. `isActive: ''` means "published and unpublished alike". */
export type AdminProductQuery = { page: number; search: string; categoryId: string; isActive: '' | 'true' | 'false'; inStock: boolean };

/**
 * The staff catalogue. `/api/admin/products` is a separate, admin-guarded route
 * rather than a flag on `/api/products` — otherwise one crafted URL would make
 * unpublishing meaningless from the storefront.
 */
export function getAdminProducts(params: AdminProductQuery & { limit: number }): Promise<ProductListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search.trim()) query.set('search', params.search.trim());
  if (params.categoryId) query.set('categoryId', params.categoryId);
  if (params.isActive) query.set('isActive', params.isActive);
  if (params.inStock) query.set('inStock', 'true');
  return apiJson<ProductListResponse>(`/api/admin/products?${query.toString()}`);
}
export function getAdminOrders(params: { page: number; limit: number; status: '' | OrderStatus; search: string }): Promise<AdminOrderListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.status) query.set('status', params.status);
  if (params.search.trim()) query.set('search', params.search.trim());
  return apiJson<AdminOrderListResponse>(`/api/orders/admin/all?${query.toString()}`);
}
export function getAdminStats(range: StatsQuery = {}): Promise<AdminStats> {
  const query = new URLSearchParams();
  if (range.from) query.set('from', range.from);
  if (range.to) query.set('to', range.to);
  const suffix = query.toString();
  return apiJson<AdminStats>(`/api/admin/stats${suffix ? `?${suffix}` : ''}`);
}
export const updateOrderStatus = ({ id, status, note }: UpdateOrderStatusInput) => apiJson<AdminOrder>(`/api/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(note?.trim() ? { status, note: note.trim() } : { status }) });

export function getAdminUsers(params: AdminUserQuery & { limit: number }): Promise<AdminUserListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search.trim()) query.set('search', params.search.trim());
  if (params.role) query.set('role', params.role);
  if (params.isActive) query.set('isActive', params.isActive);
  return apiJson<AdminUserListResponse>(`/api/admin/users?${query.toString()}`);
}
export const updateUserRole = ({ id, role }: { id: string; role: UserRole }) => apiJson<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}/role`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
export const updateUserStatus = ({ id, isActive }: { id: string; isActive: boolean }) => apiJson<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) });

export function exportCsv(kind: ExportKind, params: ExportQuery = {}): Promise<void> {
  const query = new URLSearchParams();
  if (kind === 'orders') {
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.status) query.set('status', params.status);
  }
  const suffix = query.toString();
  return downloadFile(`/api/admin/exports/${kind}.csv${suffix ? `?${suffix}` : ''}`);
}

function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) { const client = useQueryClient(); return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))); }
export function useCreateCategory() { const invalidate = useInvalidate([categoriesKey]); return useMutation({ mutationFn: createCategory, onSuccess: invalidate }); }
export function useUpdateCategory() { const invalidate = useInvalidate([categoriesKey]); return useMutation({ mutationFn: updateCategory, onSuccess: invalidate }); }
export function useDeleteCategory() { const invalidate = useInvalidate([categoriesKey]); return useMutation({ mutationFn: deleteCategory, onSuccess: invalidate }); }
// Categories carry a published-product count and the dashboard counts
// unpublished products, so both go stale the moment a product changes.
export function useCreateProduct() { const invalidate = useInvalidate([productsKey, categoriesKey, adminStatsKey]); return useMutation({ mutationFn: createProduct, onSuccess: invalidate }); }
// Also busts the single-product cache: the detail page would otherwise keep
// showing the pre-edit name until its own key expired.
export function useUpdateProduct() { const invalidate = useInvalidate([productsKey, ['product'], categoriesKey, adminStatsKey]); return useMutation({ mutationFn: updateProduct, onSuccess: invalidate }); }
export function useDeleteProduct() { const invalidate = useInvalidate([productsKey, categoriesKey, adminStatsKey]); return useMutation({ mutationFn: deleteProduct, onSuccess: invalidate }); }
export function useAdminProducts(params: AdminProductQuery) { return useQuery({ queryKey: [...productsKey, 'admin', params], queryFn: () => getAdminProducts({ ...params, limit: ADMIN_PRODUCT_PAGE_SIZE }), placeholderData: keepPreviousData }); }
/** Nested categories; shares the ['categories'] prefix so every mutation busts it. */
export function useCategoryTree() { return useQuery({ queryKey: [...categoriesKey, 'tree'], queryFn: getCategoryTree }); }
export function useAdminOrders(params: { page: number; status: '' | OrderStatus; search: string }) { return useQuery({ queryKey: [...adminOrdersKey, params], queryFn: () => getAdminOrders({ ...params, limit: ADMIN_ORDER_PAGE_SIZE }) }); }
/** placeholderData holds the previous render while a new range loads — a
 * skeleton flash on every date change would make the dashboard jump. */
export function useAdminStats(range: StatsQuery = {}) { return useQuery({ queryKey: [...adminStatsKey, range], queryFn: () => getAdminStats(range), placeholderData: keepPreviousData }); }
export function useAdminUsers(params: AdminUserQuery) { return useQuery({ queryKey: [...adminUsersKey, params], queryFn: () => getAdminUsers({ ...params, limit: ADMIN_USER_PAGE_SIZE }), placeholderData: keepPreviousData }); }
export function useUpdateOrderStatus() { const invalidate = useInvalidate([adminOrdersKey, adminStatsKey, ['orders'], ['order-history']]); return useMutation({ mutationFn: updateOrderStatus, onSuccess: invalidate }); }
export function useUpdateUserRole() { const invalidate = useInvalidate([adminUsersKey]); return useMutation({ mutationFn: updateUserRole, onSuccess: invalidate }); }
export function useUpdateUserStatus() { const invalidate = useInvalidate([adminUsersKey]); return useMutation({ mutationFn: updateUserStatus, onSuccess: invalidate }); }
export function adminError(error: unknown): string { if (!(error instanceof Error)) return 'Thao tác không thành công.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Thao tác không thành công.'; } catch { return error.message; } }
/**
 * The HTTP status behind a failed mutation. A 409 means the server refused a
 * delete that is still referenced, which deserves a different offer than a
 * generic failure — the caller cannot tell the two apart from the message alone.
 */
export function adminErrorStatus(error: unknown): number | null { if (!(error instanceof Error)) return null; try { const body = JSON.parse(error.message) as { statusCode?: number }; return typeof body.statusCode === 'number' ? body.statusCode : null; } catch { return null; } }
