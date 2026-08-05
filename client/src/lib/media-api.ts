import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NewProductImage,
  ProductImage,
  ProductImagePatch,
  ProductMedia,
  ProductTag,
  ProductWithMedia,
  TagInput,
} from '../types/media';
import { apiJson, apiVoid } from './api-client';

const tagsKey = ['tags'] as const;
const productMediaKey = ['product-media'] as const;
const productImagesKey = ['product-images'] as const;
// The gallery and the tag set both change what the catalogue shows: the primary
// image is mirrored into products.imageUrl, and `?tags=` filters listings. So
// every media mutation busts the product caches as well as its own.
const productsKey = ['products'] as const;
const productKey = ['product'] as const;

const json = { 'Content-Type': 'application/json' };
const path = (productId: string) => `/api/products/${encodeURIComponent(productId)}`;

export const getTags = () => apiJson<ProductTag[]>('/api/tags');
/** The public gallery route: published products only, same 404 as their detail page. */
export const getProductImages = (productId: string) => apiJson<ProductImage[]>(`${path(productId)}/images`);
/**
 * The gallery and tag set as staff need them — read off `/api/admin/products/:id`
 * rather than the public routes, which 404 on an unpublished product and would
 * leave the admin unable to fix the pictures of the very product they just hid.
 */
export async function getProductMedia(productId: string): Promise<ProductMedia> {
  const product = await apiJson<ProductWithMedia>(`/api/admin/products/${encodeURIComponent(productId)}`);
  return { images: product.images ?? [], tags: product.tags ?? [] };
}
export const addProductImage = ({ productId, ...body }: NewProductImage & { productId: string }) => apiJson<ProductImage>(`${path(productId)}/images`, { method: 'POST', headers: json, body: JSON.stringify(body) });
export const updateProductImage = ({ productId, imageId, ...body }: ProductImagePatch & { productId: string; imageId: string }) => apiJson<ProductImage>(`${path(productId)}/images/${encodeURIComponent(imageId)}`, { method: 'PATCH', headers: json, body: JSON.stringify(body) });
export const deleteProductImage = ({ productId, imageId }: { productId: string; imageId: string }) => apiVoid(`${path(productId)}/images/${encodeURIComponent(imageId)}`, { method: 'DELETE' });
/**
 * The whole order in one call. A PATCH per image would leave the gallery in an
 * order nobody asked for between requests, and strand it there if one failed.
 */
export const reorderProductImages = ({ productId, imageIds }: { productId: string; imageIds: string[] }) => apiJson<ProductImage[]>(`${path(productId)}/images/order`, { method: 'PUT', headers: json, body: JSON.stringify({ imageIds }) });
export const createTag = (input: TagInput) => apiJson<ProductTag>('/api/tags', { method: 'POST', headers: json, body: JSON.stringify(input) });
// Renaming leaves the slug alone unless one is sent explicitly, so existing
// `?tags=` links keep working — the caller decides, the server never re-slugs.
export const updateTag = ({ id, ...body }: TagInput & { id: string }) => apiJson<ProductTag>(`/api/tags/${encodeURIComponent(id)}`, { method: 'PATCH', headers: json, body: JSON.stringify(body) });
export const deleteTag = (id: string) => apiVoid(`/api/tags/${encodeURIComponent(id)}`, { method: 'DELETE' });
/** PUT, not PATCH: the body is the product's complete tag set; `[]` clears it. */
export const setProductTags = ({ productId, tagIds }: { productId: string; tagIds: string[] }) => apiJson<ProductTag[]>(`${path(productId)}/tags`, { method: 'PUT', headers: json, body: JSON.stringify({ tagIds }) });

function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) { const client = useQueryClient(); return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))); }

/** Every tag with its published-product count; the storefront filter bar's source. */
export function useTags() { return useQuery({ queryKey: tagsKey, queryFn: getTags }); }
export function useProductImages(productId: string) { return useQuery({ queryKey: [...productImagesKey, productId], queryFn: () => getProductImages(productId), enabled: Boolean(productId) }); }
export function useProductMedia(productId: string) { return useQuery({ queryKey: [...productMediaKey, productId], queryFn: () => getProductMedia(productId), enabled: Boolean(productId) }); }

const galleryKeys = [productMediaKey, productImagesKey, productsKey, productKey];
export function useAddProductImage() { const invalidate = useInvalidate(galleryKeys); return useMutation({ mutationFn: addProductImage, onSuccess: invalidate }); }
export function useUpdateProductImage() { const invalidate = useInvalidate(galleryKeys); return useMutation({ mutationFn: updateProductImage, onSuccess: invalidate }); }
export function useDeleteProductImage() { const invalidate = useInvalidate(galleryKeys); return useMutation({ mutationFn: deleteProductImage, onSuccess: invalidate }); }
export function useReorderProductImages() { const invalidate = useInvalidate(galleryKeys); return useMutation({ mutationFn: reorderProductImages, onSuccess: invalidate }); }
// Tag writes move the counts on /api/tags as well as what `?tags=` returns.
const tagKeys = [tagsKey, productMediaKey, productsKey, productKey];
export function useCreateTag() { const invalidate = useInvalidate([tagsKey]); return useMutation({ mutationFn: createTag, onSuccess: invalidate }); }
export function useUpdateTag() { const invalidate = useInvalidate(tagKeys); return useMutation({ mutationFn: updateTag, onSuccess: invalidate }); }
export function useDeleteTag() { const invalidate = useInvalidate(tagKeys); return useMutation({ mutationFn: deleteTag, onSuccess: invalidate }); }
export function useSetProductTags() { const invalidate = useInvalidate(tagKeys); return useMutation({ mutationFn: setProductTags, onSuccess: invalidate }); }

/** The server's message when it has one — a 409 on a duplicate slug says more than "thất bại". */
export function mediaError(error: unknown): string { if (!(error instanceof Error)) return 'Thao tác không thành công.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Thao tác không thành công.'; } catch { return error.message; } }
