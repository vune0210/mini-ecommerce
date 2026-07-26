import { apiFetch, apiJson } from './api-client';
import type { Category, Product, ProductListResponse, ProductSort } from '../types/catalog';

export function getCategories(): Promise<Category[]> {
  return apiJson<Category[]>('/api/categories');
}

export function getProducts(params: { search: string; categoryId: string; page: number; limit: number; sort?: ProductSort; minPrice?: string; maxPrice?: string }): Promise<ProductListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search) query.set('search', params.search);
  if (params.categoryId) query.set('categoryId', params.categoryId);
  if (params.sort && params.sort !== 'newest') query.set('sort', params.sort);
  if (params.minPrice) query.set('minPrice', params.minPrice);
  if (params.maxPrice) query.set('maxPrice', params.maxPrice);
  return apiJson<ProductListResponse>(`/api/products?${query.toString()}`);
}

export async function getProduct(id: string): Promise<Product | null> {
  const response = await apiFetch(`/api/products/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error((await response.text()) || `Request failed: ${response.status}`);
  return response.json() as Promise<Product>;
}
