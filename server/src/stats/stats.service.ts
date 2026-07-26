import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  LessThanOrEqual,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
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
  customers: number;
  products: { total: number; outOfStock: number };
  topProducts: TopProduct[];
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
  ) {}

  async overview(query: StatsQueryDto): Promise<AdminStats> {
    const range = reportingRange(query.from, query.to, REPORTING_TIMEZONE);
    if (!range.valid) throw new BadRequestException(range.error);

    const rollup = this.orders
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(order.total_amount)', 'sum')
      // The commerce money-breakdown migration adds subtotal_amount /
      // discount_amount / shipping_fee. Until it lands these columns do not
      // exist, so selecting them would fail at runtime; NULL keeps the rollup
      // shape and revenueBreakdown already resolves missing buckets to '0.00'.
      .addSelect('NULL', 'subtotal')
      .addSelect('NULL', 'discount')
      .addSelect('NULL', 'shipping')
      .groupBy('order.status');
    this.applyRange(rollup, range);
    const rows = await rollup.getRawMany<RollupRow>();

    const byStatus = statusCounts(rows);
    const revenue = revenueBreakdown(rows);
    const countable = countableOrders(byStatus);

    const [customers, productTotal, outOfStock, topProducts, lowStock, series] =
      await Promise.all([
        this.users.count({ where: { role: UserRole.CUSTOMER } }),
        this.products.count(),
        this.products.count({ where: { stock: 0 } }),
        this.bestSellers(query.topLimit, range),
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
      customers,
      products: { total: productTotal, outOfStock },
      topProducts,
      lowStock,
      series,
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
