import { apiFetch, apiJson } from './api-client';
import type {
  Category,
  CategoryNode,
  Product,
  ProductFilters,
  ProductListResponse,
} from '../types/catalog';

export function getCategories(): Promise<Category[]> {
  return apiJson<Category[]>('/api/categories');
}

/**
 * The same rows as `/api/categories`, nested by parent and each carrying the
 * number of published products filed directly under it — the subtree total is
 * the caller's to add up, since only the caller knows whether it is filtering
 * one category or a whole branch.
 */
export function getCategoryTree(): Promise<CategoryNode[]> {
  return apiJson<CategoryNode[]>('/api/categories/tree');
}

export type ProductQuery = ProductFilters & { page: number; limit: number };

export function getProducts(params: ProductQuery): Promise<ProductListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search) query.set('search', params.search);
  if (params.categoryId) {
    query.set('categoryId', params.categoryId);
    // Only meaningful next to a category, so it is never sent on its own.
    if (params.includeDescendants) query.set('includeDescendants', 'true');
  }
  if (params.sort && params.sort !== 'newest') query.set('sort', params.sort);
  if (params.minPrice) query.set('minPrice', params.minPrice);
  if (params.maxPrice) query.set('maxPrice', params.maxPrice);
  if (params.inStock) query.set('inStock', 'true');
  if (params.minRating) query.set('minRating', String(params.minRating));
  // Comma-joined, the shape the API parses. Sent only when non-empty: an empty
  // `tags=` would be a filter matching nothing rather than no filter at all.
  if (params.tags?.length) query.set('tags', params.tags.join(','));
  return apiJson<ProductListResponse>(`/api/products?${query.toString()}`);
}

export async function getProduct(id: string): Promise<Product | null> {
  const response = await apiFetch(`/api/products/${encodeURIComponent(id)}`);
  // Unpublished products answer 404 as well, on purpose: the storefront must
  // not be able to tell "hidden" apart from "never existed".
  if (response.status === 404) return null;
  if (!response.ok) throw new Error((await response.text()) || `Request failed: ${response.status}`);
  return response.json() as Promise<Product>;
}

/**
 * In-stock products from the same category, best rated first. A plain array,
 * not a paginated envelope — the server caps it at a handful.
 */
export function getRelatedProducts(id: string): Promise<Product[]> {
  return apiJson<Product[]>(`/api/products/${encodeURIComponent(id)}/related`);
}
