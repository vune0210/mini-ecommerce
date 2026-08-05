import type { Product } from './catalog';

/**
 * A row of `product_images`. The gallery arrives already sorted by `position`,
 * and exactly one row per product carries `isPrimary` — the server elects it on
 * every write, so the client never has to repair or second-guess the flag.
 */
export type ProductImage = {
  id: string;
  productId: string;
  url: string;
  /** Null when nobody wrote one; the server never fabricates one from the name. */
  altText: string | null;
  /** Dense 0..n-1 within the product. */
  position: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

/** A catalogue-wide label. `productCount` is only attached by `GET /api/tags`. */
export type ProductTag = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  /** Published products wearing this tag. Absent on the per-product responses. */
  productCount?: number;
};

/** What the product detail routes now carry alongside the product itself. */
export type ProductMedia = { images: ProductImage[]; tags: ProductTag[] };

export type ProductWithMedia = Product & Partial<ProductMedia>;

export type NewProductImage = {
  url: string;
  altText?: string;
  /** Slot to insert at; appended when omitted, clamped when past the end. */
  position?: number;
  isPrimary?: boolean;
};

export type ProductImagePatch = {
  /** Null clears the description; omit to leave it alone. */
  altText?: string | null;
  position?: number;
  /**
   * Deliberately `true` and not `boolean`: the API ignores `false`, because a
   * gallery with no primary would blank the product thumbnail. Demoting an
   * image means promoting another one, and the type says so.
   */
  isPrimary?: true;
};

export type TagInput = { name: string; slug?: string };
