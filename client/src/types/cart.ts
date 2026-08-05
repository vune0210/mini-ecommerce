import type { Product } from './catalog';

export type CartItem = {
  id: string;
  quantity: number;
  product: Product;
  subtotal: string;
  /**
   * False once the line can no longer be checked out as it stands — the
   * product sold out or was unpublished while it sat in the cart.
   */
  available: boolean;
};
export type Cart = { id: string; items: CartItem[]; totalItems: number; totalAmount: string };
