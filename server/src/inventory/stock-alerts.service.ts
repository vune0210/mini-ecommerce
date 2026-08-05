import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Product } from '../products/entities/product.entity';
import { StockAlert } from './entities/stock-alert.entity';

export type StockAlertEntry = {
  id: string;
  product: Product;
  /** True once the product is buyable again but the sweep has not run yet. */
  inStock: boolean;
  createdAt: Date;
};

@Injectable()
export class StockAlertsService {
  constructor(
    @InjectRepository(StockAlert)
    private readonly alerts: Repository<StockAlert>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly notifications: NotificationsService,
  ) {}

  list(userId: string): Promise<StockAlert[]> {
    return this.alerts.find({
      where: { userId },
      relations: { product: { category: true } },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Idempotent: subscribing twice is a no-op rather than a 409, and the
   * duplicate is caught at the unique index because two rapid taps race past
   * any read-then-insert check.
   */
  async subscribe(userId: string, productId: string): Promise<StockAlert[]> {
    const product = await this.products.findOneBy({ id: productId });
    if (!product) throw new NotFoundException('Product not found');
    // Subscribing to something already on the shelf would fire immediately —
    // or never, since the crossing has already happened. Say so instead.
    if (product.stock > 0)
      throw new BadRequestException('Product is already in stock');
    if (!product.isActive)
      throw new BadRequestException('Product is no longer available');
    try {
      await this.alerts.insert({ userId, productId });
    } catch (error) {
      const duplicate =
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === 'ER_DUP_ENTRY';
      if (!duplicate) throw error;
    }
    return this.list(userId);
  }

  async unsubscribe(userId: string, productId: string): Promise<void> {
    const removed = await this.alerts.delete({ userId, productId });
    if (!removed.affected)
      throw new NotFoundException('You are not watching this product');
  }

  /**
   * Fires every waiting alert for a product and clears them, inside the
   * caller's transaction so the notifications commit with the stock movement
   * that caused them.
   *
   * Rows are deleted rather than flagged: a subscription that has been honoured
   * is not a record anyone needs, and deleting it is what lets the same
   * customer subscribe again the next time the product sells out.
   */
  async fireFor(
    manager: EntityManager,
    productId: string,
    productName: string,
  ): Promise<void> {
    const repository = manager.getRepository(StockAlert);
    const waiting = await repository.findBy({ productId });
    if (!waiting.length) return;
    await this.notifications.notifyMany(
      manager,
      waiting.map((alert) => ({
        userId: alert.userId,
        type: NotificationType.STOCK_BACK,
        title: `${productName} đã có hàng trở lại`,
        body: 'Sản phẩm bạn theo dõi vừa được nhập lại. Số lượng có hạn.',
        metadata: { productId },
      })),
    );
    await repository.delete({ productId });
  }
}
