import type { Product } from './catalog';

export type CartItem = { id: string; quantity: number; product: Product; subtotal: string };
export type Cart = { id: string; items: CartItem[]; totalItems: number; totalAmount: string };
