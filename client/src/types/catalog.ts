import type { ProductImage, ProductTag } from './media';

export type Category = {
  id: string;
  name: string;
  slug: string;
  /** Null for a top-level category. */
  parentId: string | null;
  /** Published products filed directly under this category, not the subtree. */
  productCount?: number;
  createdAt: string;
  updatedAt: string;
};

/** `GET /api/categories/tree` — the same rows nested by parentId. */
export type CategoryNode = Category & { children: CategoryNode[] };

export type Product = {
  id: string;
  name: string;
  slug: string;
  /** Warehouse identifier. Null until an admin assigns one. */
  sku: string | null;
  /** Unpublished products are hidden from the storefront entirely. */
  isActive: boolean;
  description: string;
  price: string;
  stock: number;
  imageUrl: string | null;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
  category: Category;
  averageRating?: number;
  reviewCount?: number;
  /**
   * Attached by the server on detail responses only — listings stay on the
   * legacy `imageUrl` thumbnail rather than fanning out two queries per page.
   * Optional here for exactly that reason, mirroring the entity.
   *
   * The import is type-only and circular by design: `media.ts` describes the
   * rows, `catalog.ts` describes where they hang. TypeScript erases both.
   */
  images?: ProductImage[];
  tags?: ProductTag[];
};

export type ProductSort =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'rating_desc'
  | 'name_asc';

export type ProductFilters = {
  search?: string;
  categoryId?: string;
  includeDescendants?: boolean;
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  minRating?: number;
  /**
   * Tag slugs. The API narrows: a product must carry EVERY slug listed, so a
   * second tag shows fewer results, not more.
   */
  tags?: string[];
  sort?: ProductSort;
};

export type Review = {
  id: string;
  rating: number;
  comment: string | null;
  author: { id: string; name: string };
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
};

/** `/reviews/mine` also reports moderation, so an author is never left guessing. */
export type MyReview = Review & { isHidden: boolean };

export type ReviewSort = 'newest' | 'helpful' | 'rating_desc' | 'rating_asc';

export type ReviewListResponse = {
  items: Review[];
  total: number;
  page: number;
  limit: number;
  summary: {
    averageRating: number;
    reviewCount: number;
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  };
};

export type ProductListResponse = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};
