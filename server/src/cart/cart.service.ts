import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartItem } from './entities/cart-item.entity';
import { Cart } from './entities/cart.entity';
import { cartTotals } from './cart-calculations';

export type CartResponse = {
  id: string;
  items: Array<{
    id: string;
    quantity: number;
    product: Product;
    subtotal: string;
    /** False when the line can no longer be checked out as it stands. */
    available: boolean;
  }>;
  totalItems: number;
  totalAmount: string;
};

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart) private readonly carts: Repository<Cart>,
    @InjectRepository(CartItem) private readonly items: Repository<CartItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async getCart(userId: string): Promise<CartResponse> {
    return this.serialize(await this.cartFor(userId));
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartResponse> {
    const [cart, product] = await Promise.all([
      this.cartFor(userId),
      this.product(dto.productId),
    ]);
    const existing = cart.items.find((item) => item.productId === product.id);
    const quantity = (existing?.quantity ?? 0) + dto.quantity;
    this.assertStock(quantity, product);
    if (existing) {
      existing.quantity = quantity;
      await this.items.save(existing);
    } else {
      await this.items.save(
        this.items.create({
          cart,
          cartId: cart.id,
          product,
          productId: product.id,
          quantity,
        }),
      );
    }
    return this.getCart(userId);
  }

  async updateItem(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartResponse> {
    const cart = await this.cartFor(userId);
    const item = cart.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    this.assertStock(dto.quantity, item.product);
    item.quantity = dto.quantity;
    await this.items.save(item);
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartResponse> {
    const cart = await this.cartFor(userId);
    const item = cart.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    await this.items.remove(item);
    return this.getCart(userId);
  }

  private async cartFor(userId: string): Promise<Cart> {
    let cart = await this.carts.findOne({
      where: { user: { id: userId } },
      relations: { items: { product: true } },
    });
    if (!cart) {
      cart = await this.carts.save(this.carts.create({ user: { id: userId } }));
      cart.items = [];
    }
    return cart;
  }

  private async product(id: string): Promise<Product> {
    const product = await this.products.findOneBy({ id });
    if (!product) throw new NotFoundException('Product not found');
    // Unpublished products are invisible to the storefront, so an add-to-cart
    // naming one came from a stale page or a crafted request either way.
    if (!product.isActive)
      throw new BadRequestException('Product is no longer available');
    return product;
  }

  private assertStock(quantity: number, product: Product): void {
    if (quantity > product.stock)
      throw new BadRequestException(
        'Requested quantity exceeds available stock',
      );
  }

  private serialize(cart: Cart): CartResponse {
    const totals = cartTotals(cart.items);
    const items = cart.items.map((item, index) => ({
      id: item.id,
      quantity: item.quantity,
      product: item.product,
      subtotal: totals.subtotals[index],
      // Surfaced per line rather than silently dropped: a cart that quietly
      // loses an item is how a customer discovers at delivery that half the
      // order was never placed.
      available: item.product.isActive && item.quantity <= item.product.stock,
    }));
    return {
      id: cart.id,
      items,
      totalItems: totals.totalItems,
      totalAmount: totals.totalAmount,
    };
  }
}
