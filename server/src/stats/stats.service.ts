import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  LessThanOrEqual,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { CouponRedemption } from '../coupons/entities/coupon-redemption.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { StatsQueryDto } from './dto/stats-query.dto';
import {
  averageOrderValue,
  countableOrders,
  COUNTABLE_ORDER_STATUSES,
  DailyPoint,
  dailySeries,
  REPORTING_TIMEZONE,
  reportingRange,
  ResolvedRange,
  RevenueBreakdown,
  revenueBreakdown,
  statusCounts,
  StatusCounts,
  totalOrders,
} from './stats-calculations';

export type TopProduct = {
  productId: string | null;
  productName: string;
  quantitySold: number;
  revenue: string;
};

export type LowStockProduct = {
  id: string;
  name: string;
  slug: string;
  stock: number;
};

export type TopCustomer = {
  userId: string;
  name: string;
  email: string;
  orders: number;
  revenue: string;
};

export type CategoryRevenue = {
  categoryId: string | null;
  categoryName: string;
  quantitySold: number;
  revenue: string;
};

export type CouponUsage = {
  redemptions: number;
  discountTotal: string;
  /** Codes ranked by the money they gave away, not by how often they were used. */
  topCodes: Array<{ code: string; redemptions: number; discount: string }>;
};

export type AdminStats = {
  /**
   * Echo of the applied window. appliesTo 'series-only' means from/to were
   * omitted: aggregates are all-time while the series trails 30 days.
   */
  range: {
    from: string | null;
    to: string | null;
    timezone: string;
    appliesTo: 'all' | 'series-only';
  };
  revenue: RevenueBreakdown;
  orders: {
    total: number;
    countable: number;
    byStatus: StatusCounts;
    averageOrderValue: string;
  };
  customers: {
    total: number;
    /** Accounts created inside the window; equals total when it is all-time. */
    newInRange: number;
    /** Customers with more than one countable order in the window. */
    repeat: number;
  };
  products: { total: number; outOfStock: number; unpublished: number };
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
  revenueByCategory: CategoryRevenue[];
  coupons: CouponUsage;
  lowStock: LowStockProduct[];
  /** One point per UTC day; only countable statuses contribute. */
  series: DailyPoint[];
};

type RollupRow = {
  status: string;
  count: string;
  sum: string | null;
  subtotal: string | null;
  discount: string | null;
  shipping: string | null;
};

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(CouponRedemption)
    private readonly redemptions: Repository<CouponRedemption>,
  ) {}

  async overview(query: StatsQueryDto): Promise<AdminStats> {
    const range = reportingRange(query.from, query.to, REPORTING_TIMEZONE);
    if (!range.valid) throw new BadRequestException(range.error);

    const rollup = this.orders
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(order.total_amount)', 'sum')
      .addSelect('SUM(order.subtotal_amount)', 'subtotal')
      .addSelect('SUM(order.discount_amount)', 'discount')
      .addSelect('SUM(order.shipping_fee)', 'shipping')
      .groupBy('order.status');
    this.applyRange(rollup, range);
    const rows = await rollup.getRawMany<RollupRow>();

    const byStatus = statusCounts(rows);
    const revenue = revenueBreakdown(rows);
    const countable = countableOrders(byStatus);

    const [
      customerTotal,
      newCustomers,
      repeatCustomers,
      productTotal,
      outOfStock,
      unpublished,
      topProducts,
      topCustomers,
      revenueByCategory,
      coupons,
      lowStock,
      series,
    ] = await Promise.all([
      this.users.count({ where: { role: UserRole.CUSTOMER } }),
      this.newCustomers(range),
      this.repeatCustomers(range),
      this.products.count(),
      this.products.count({ where: { stock: 0 } }),
      this.products.count({ where: { isActive: false } }),
      this.bestSellers(query.topLimit, range),
      this.bestCustomers(query.topLimit, range),
      this.categoryRevenue(range),
      this.couponUsage(query.topLimit, range),
      this.lowStockProducts(query.lowStockThreshold, query.lowStockLimit),
      this.revenueSeries(range),
    ]);

    return {
      range: {
        from: range.from,
        to: range.to,
        timezone: range.timezone,
        appliesTo: range.appliesTo,
      },
      revenue,
      orders: {
        total: totalOrders(byStatus),
        countable,
        byStatus,
        // Denominator is countable orders: unpaid PENDING and refunded
        // CANCELLED orders must not dilute the average.
        averageOrderValue: averageOrderValue(revenue.net, countable),
      },
      customers: {
        total: customerTotal,
        newInRange: newCustomers,
        repeat: repeatCustomers,
      },
      products: { total: productTotal, outOfStock, unpublished },
      topProducts,
      topCustomers,
      revenueByCategory,
      coupons,
      lowStock,
      series,
    };
  }

  /**
   * Sign-ups inside the window. Counted on `users.created_at`, so this is
   * genuinely "new accounts" and not "accounts that happened to order" — the
   * two diverge exactly where acquisition reporting matters.
   */
  private async newCustomers(range: ResolvedRange): Promise<number> {
    const builder = this.users
      .createQueryBuilder('user')
      .where('user.role = :role', { role: UserRole.CUSTOMER });
    if (range.appliesTo === 'all') {
      if (range.fromBound)
        builder.andWhere('user.created_at >= :fromBound', {
          fromBound: range.fromBound,
        });
      if (range.toBound)
        builder.andWhere('user.created_at < :toBound', {
          toBound: range.toBound,
        });
    }
    return builder.getCount();
  }

  /**
   * Customers with more than one countable order in the window. A HAVING over
   * the grouped orders, then counted as rows — MySQL cannot COUNT DISTINCT the
   * result of a HAVING without the derived table, so the subquery is explicit.
   */
  private async repeatCustomers(range: ResolvedRange): Promise<number> {
    const grouped = this.orders
      .createQueryBuilder('order')
      .select('order.user_id', 'userId')
      .where('order.status IN (:...countable)', {
        countable: COUNTABLE_ORDER_STATUSES,
      })
      .groupBy('order.user_id')
      .having('COUNT(*) > 1');
    this.applyRange(grouped, range);
    return (await grouped.getRawMany()).length;
  }

  /** Highest-spending customers over countable orders in the window. */
  private async bestCustomers(
    limit: number,
    range: ResolvedRange,
  ): Promise<TopCustomer[]> {
    const builder = this.orders
      .createQueryBuilder('order')
      .innerJoin('order.user', 'user')
      .select('user.id', 'userId')
      .addSelect('user.name', 'name')
      .addSelect('user.email', 'email')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('SUM(order.total_amount)', 'revenue')
      .where('order.status IN (:...countable)', {
        countable: COUNTABLE_ORDER_STATUSES,
      })
      .groupBy('user.id')
      .orderBy('SUM(order.total_amount)', 'DESC')
      .limit(limit);
    this.applyRange(builder, range);
    const rows = await builder.getRawMany<{
      userId: string;
      name: string;
      email: string;
      orders: string;
      revenue: string;
    }>();
    return rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      orders: Number(row.orders),
      revenue: Number(row.revenue).toFixed(2),
    }));
  }

  /**
   * Merchandise revenue per category, from line subtotals. Lines whose product
   * was deleted have no category left to attribute to and are grouped under a
   * null id rather than dropped, so the parts still add up to the whole.
   */
  private async categoryRevenue(
    range: ResolvedRange,
  ): Promise<CategoryRevenue[]> {
    const builder = this.orderItems
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .leftJoin(Product, 'product', 'product.id = item.product_id')
      .leftJoin(Category, 'category', 'category.id = product.category_id')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('SUM(item.quantity)', 'quantitySold')
      .addSelect('SUM(item.subtotal)', 'revenue')
      .where('order.status IN (:...countable)', {
        countable: COUNTABLE_ORDER_STATUSES,
      })
      .groupBy('category.id')
      .addGroupBy('category.name')
      .orderBy('SUM(item.subtotal)', 'DESC');
    this.applyRange(builder, range);
    const rows = await builder.getRawMany<{
      categoryId: string | null;
      categoryName: string | null;
      quantitySold: string;
      revenue: string;
    }>();
    return rows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? 'Deleted product',
      quantitySold: Number(row.quantitySold),
      revenue: Number(row.revenue).toFixed(2),
    }));
  }

  /**
   * What the discount programme actually cost. Read from the redemption ledger
   * rather than from `orders.discount_amount` so a cancelled order — whose
   * redemption is released — stops counting against the budget.
   */
  private async couponUsage(
    limit: number,
    range: ResolvedRange,
  ): Promise<CouponUsage> {
    const scoped = (builder: SelectQueryBuilder<CouponRedemption>) => {
      builder.innerJoin('redemption.order', 'order');
      this.applyRange(builder, range);
      return builder;
    };
    const totals = await scoped(
      this.redemptions
        .createQueryBuilder('redemption')
        .select('COUNT(*)', 'redemptions')
        .addSelect('SUM(redemption.discount_amount)', 'discount'),
    ).getRawOne<{ redemptions: string; discount: string | null }>();
    const topRows = await scoped(
      this.redemptions
        .createQueryBuilder('redemption')
        .innerJoin('redemption.coupon', 'coupon')
        .select('coupon.code', 'code')
        .addSelect('COUNT(*)', 'redemptions')
        .addSelect('SUM(redemption.discount_amount)', 'discount')
        .groupBy('coupon.code')
        .orderBy('SUM(redemption.discount_amount)', 'DESC')
        .limit(limit),
    ).getRawMany<{ code: string; redemptions: string; discount: string }>();
    return {
      redemptions: Number(totals?.redemptions ?? 0),
      discountTotal: Number(totals?.discount ?? 0).toFixed(2),
      topCodes: topRows.map((row) => ({
        code: row.code,
        redemptions: Number(row.redemptions),
        discount: Number(row.discount).toFixed(2),
      })),
    };
  }

  /** Half-open [from, to + 1 day) predicates; skipped when no range was given. */
  private applyRange<T extends ObjectLiteral>(
    builder: SelectQueryBuilder<T>,
    range: ResolvedRange,
  ): void {
    if (range.appliesTo !== 'all') return;
    if (range.fromBound)
      builder.andWhere('order.created_at >= :fromBound', {
        fromBound: range.fromBound,
      });
    if (range.toBound)
      builder.andWhere('order.created_at < :toBound', {
        toBound: range.toBound,
      });
  }

  /**
   * Only countable statuses sell: PENDING money is not collected yet and
   * CANCELLED units went back to stock. Revenue here sums line subtotals, so
   * topProducts reconciles with revenue.merchandise, never revenue.net.
   */
  private async bestSellers(
    limit: number,
    range: ResolvedRange,
  ): Promise<TopProduct[]> {
    // Group by identity, never by the order item's name snapshot: renaming a
    // product would otherwise split its sales across two rows. Deleted products
    // keep a null product_id, so they fall back to grouping by their snapshot.
    const groupKey =
      "COALESCE(item.product_id, CONCAT('deleted:', item.product_name))";
    const builder = this.orderItems
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .leftJoin(Product, 'product', 'product.id = item.product_id')
      .select(groupKey, 'groupKey')
      .addSelect('MAX(item.product_id)', 'productId')
      .addSelect(
        'COALESCE(MAX(product.name), MAX(item.product_name))',
        'productName',
      )
      .addSelect('SUM(item.quantity)', 'quantitySold')
      .addSelect('SUM(item.subtotal)', 'revenue')
      .where('order.status IN (:...countable)', {
        countable: COUNTABLE_ORDER_STATUSES,
      })
      .groupBy(groupKey)
      .orderBy('SUM(item.quantity)', 'DESC')
      .limit(limit);
    this.applyRange(builder, range);
    const rows = await builder.getRawMany<{
      productId: string | null;
      productName: string;
      quantitySold: string;
      revenue: string;
    }>();
    return rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      quantitySold: Number(row.quantitySold),
      revenue: Number(row.revenue).toFixed(2),
    }));
  }

  /**
   * UTC day buckets: the backend and MySQL both run with TZ=UTC, so created_at
   * needs no CONVERT_TZ before DATE_FORMAT. Only countable statuses contribute,
   * so a PENDING order's day shows orders: 0 / revenue '0.00'.
   */
  private async revenueSeries(range: ResolvedRange): Promise<DailyPoint[]> {
    const day = "DATE_FORMAT(order.created_at, '%Y-%m-%d')";
    const rows = await this.orders
      .createQueryBuilder('order')
      .select(day, 'day')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('SUM(order.total_amount)', 'revenue')
      .where('order.status IN (:...countable)', {
        countable: COUNTABLE_ORDER_STATUSES,
      })
      .andWhere('order.created_at >= :seriesFrom', {
        seriesFrom: range.seriesFromBound,
      })
      .andWhere('order.created_at < :seriesTo', {
        seriesTo: range.seriesToBound,
      })
      .groupBy(day)
      .getRawMany<{ day: string; orders: string; revenue: string | null }>();
    return dailySeries(rows, range.seriesFrom, range.seriesTo);
  }

  private async lowStockProducts(
    threshold: number,
    limit: number,
  ): Promise<LowStockProduct[]> {
    return this.products.find({
      where: { stock: LessThanOrEqual(threshold) },
      order: { stock: 'ASC', name: 'ASC' },
      take: limit,
      select: { id: true, name: true, slug: true, stock: true },
    });
  }
}
