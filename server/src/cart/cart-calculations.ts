import { Product } from '../products/entities/product.entity';
import { CartItem } from './entities/cart-item.entity';

export function cartTotals(
  items: Array<
    Pick<CartItem, 'quantity'> & { product: Pick<Product, 'price'> }
  >,
): { totalItems: number; totalAmount: string; subtotals: string[] } {
  const subtotals = items.map((item) =>
    (Number(item.product.price) * item.quantity).toFixed(2),
  );
  return {
    totalItems: items.reduce((total, item) => total + item.quantity, 0),
    totalAmount: subtotals
      .reduce((total, subtotal) => total + Number(subtotal), 0)
      .toFixed(2),
    subtotals,
  };
}
