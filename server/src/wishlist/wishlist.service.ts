import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CartResponse, CartService } from '../cart/cart.service';
import { Product } from '../products/entities/product.entity';
import { WishlistItem } from './entities/wishlist-item.entity';

export type WishlistEntry = {
  id: string;
  product: Product;
  /** False once the product sells out, so the UI can disable "add to cart". */
  inStock: boolean;
  createdAt: Date;
};

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly items: Repository<WishlistItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly cart: CartService,
  ) {}

  async list(userId: string): Promise<WishlistEntry[]> {
    const rows = await this.items.find({
      where: { userId },
      relations: { product: { category: true } },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      product: row.product,
      inStock: row.product.stock > 0,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Idempotent: saving a product already on the list is a no-op rather than a
   * 409. Two rapid taps race past any read-then-insert check, so the duplicate
   * is caught at the unique index and swallowed there.
   */
  async add(userId: string, productId: string): Promise<WishlistEntry[]> {
    if (!(await this.products.findOneBy({ id: productId })))
      throw new NotFoundException('Product not found');
    try {
      await this.items.insert({ userId, productId });
    } catch (error) {
      const duplicate =
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === 'ER_DUP_ENTRY';
      if (!duplicate) throw error;
    }
    return this.list(userId);
  }

  async remove(userId: string, productId: string): Promise<void> {
    const result = await this.items.delete({ userId, productId });
    if (!result.affected)
      throw new NotFoundException('Product is not on the wishlist');
  }

  /**
   * Adds to the cart first and only then unsaves. The other order would drop
   * the product from the wishlist and then fail the stock check, leaving the
   * customer with neither.
   */
  async moveToCart(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartResponse> {
    const saved = await this.items.findOneBy({ userId, productId });
    if (!saved) throw new NotFoundException('Product is not on the wishlist');
    const cart = await this.cart.addItem(userId, { productId, quantity });
    await this.items.delete({ id: saved.id });
    return cart;
  }
}
