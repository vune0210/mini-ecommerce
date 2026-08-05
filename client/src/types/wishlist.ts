import type { Product } from './catalog';

/** One saved product. `GET /api/wishlist` answers with these, newest first. */
export type WishlistEntry = {
  id: string;
  product: Product;
  /**
   * False once the product sells out. The entry stays on the list either way —
   * only "move to cart" is withdrawn, so the customer keeps the reminder.
   */
  inStock: boolean;
  createdAt: string;
};
