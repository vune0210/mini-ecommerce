import type { Product } from './catalog';

/**
 * A back-in-stock subscription. The server deletes the row the moment the
 * alert fires, so the presence of a row means "still waiting" — there is no
 * "already notified" state to render.
 */
export type StockAlert = {
  id: string;
  productId: string;
  product: Product;
  createdAt: string;
};
