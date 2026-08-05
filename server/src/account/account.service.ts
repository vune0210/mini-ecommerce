import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from '../addresses/entities/address.entity';
import { StockAlert } from '../inventory/entities/stock-alert.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { Review } from '../reviews/entities/review.entity';
import { StatusCounts } from '../stats/stats-calculations';
import { WishlistItem } from '../wishlist/entities/wishlist-item.entity';
import {
  AccountAction,
  accountActions,
  averageSpend,
  countableOf,
  customerStatusCounts,
  lifetimeSpend,
} from './account-rules';

export type AccountOverview = {
  orders: {
    total: number;
    /** Orders that count as spend — excludes PENDING and CANCELLED. */
    countable: number;
    byStatus: StatusCounts;
  };
  spend: { lifetime: string; average: string };
  saved: { wishlist: number; addresses: number; stockAlerts: number };
  reviews: {
    written: number;
    /** Products bought and completed that the customer has not reviewed yet. */
    invited: number;
  };
  actions: AccountAction[];
};

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(WishlistItem)
    private readonly wishlist: Repository<WishlistItem>,
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
    @InjectRepository(StockAlert)
    private readonly stockAlerts: Repository<StockAlert>,
  ) {}

  /**
   * One round of parallel counts rather than a page that fires six requests.
   * Every number is scoped to the caller by user id in the query itself — none
   * of this takes a user parameter from the client, so there is no id to tamper
   * with and no ownership check that could be forgotten.
   */
  async overview(
    userId: string,
    emailVerified: boolean,
  ): Promise<AccountOverview> {
    const [rollup, wishlist, addresses, stockAlerts, written, invited] =
      await Promise.all([
        this.orders
          .createQueryBuilder('order')
          .select('order.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .addSelect('SUM(order.total_amount)', 'sum')
          .where('order.user_id = :userId', { userId })
          .groupBy('order.status')
          .getRawMany<{ status: string; count: string; sum: string | null }>(),
        this.wishlist.countBy({ userId }),
        this.addresses.countBy({ userId }),
        this.stockAlerts.countBy({ userId }),
        this.reviews.countBy({ userId }),
        this.reviewableProductCount(userId),
      ]);

    const byStatus = customerStatusCounts(rollup);
    const countable = countableOf(byStatus);
    const lifetime = lifetimeSpend(rollup);

    return {
      orders: {
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        countable,
        byStatus,
      },
      spend: { lifetime, average: averageSpend(lifetime, countable) },
      saved: { wishlist, addresses, stockAlerts },
      reviews: { written, invited },
      actions: accountActions({
        counts: byStatus,
        reviewableProducts: invited,
        emailVerified,
      }),
    };
  }

  /**
   * Distinct products the customer may still review: bought on a COMPLETED
   * order and not reviewed yet. Mirrors exactly what `ReviewsService.create`
   * will accept, so the count can never invite a review the API would refuse.
   */
  private async reviewableProductCount(userId: string): Promise<number> {
    const rows = await this.orderItems
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .select('COUNT(DISTINCT item.product_id)', 'count')
      .where('order.user_id = :userId', { userId })
      .andWhere('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('item.product_id IS NOT NULL')
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM `reviews` `r` WHERE `r`.`product_id` = `item`.`product_id` AND `r`.`user_id` = :userId)',
      )
      .getRawOne<{ count: string }>();
    return Number(rows?.count ?? 0);
  }
}
