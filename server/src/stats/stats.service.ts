import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { StatsQueryDto } from './dto/stats-query.dto';
import {
  averageOrderValue,
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
  revenue: { net: string; completed: string; cancelled: string };
  orders: {
    total: number;
    byStatus: StatusCounts;
    averageOrderValue: string;
  };
  customers: number;
  products: { total: number; outOfStock: number };
  topProducts: TopProduct[];
  lowStock: LowStockProduct[];
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
    const rows = await this.orders
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(order.total_amount)', 'sum')
      .groupBy('order.status')
      .getRawMany<{ status: string; count: string; sum: string | null }>();

    const byStatus = statusCounts(rows);
    const revenue = revenueBreakdown(rows);
    const billableOrders =
      totalOrders(byStatus) - byStatus[OrderStatus.CANCELLED];

    const [customers, productTotal, outOfStock, topProducts, lowStock] =
      await Promise.all([
        this.users.count({ where: { role: UserRole.CUSTOMER } }),
        this.products.count(),
        this.products.count({ where: { stock: 0 } }),
        this.bestSellers(query.topLimit),
        this.lowStockProducts(query.lowStockThreshold, query.lowStockLimit),
      ]);

    return {
      revenue,
      orders: {
        total: totalOrders(byStatus),
        byStatus,
        averageOrderValue: averageOrderValue(revenue.net, billableOrders),
      },
      customers,
      products: { total: productTotal, outOfStock },
      topProducts,
      lowStock,
    };
  }

  /** Cancelled orders are excluded so restocked items do not inflate sales. */
  private async bestSellers(limit: number): Promise<TopProduct[]> {
    // Group by identity, never by the order item's name snapshot: renaming a
    // product would otherwise split its sales across two rows. Deleted products
    // keep a null product_id, so they fall back to grouping by their snapshot.
    const groupKey =
      "COALESCE(item.product_id, CONCAT('deleted:', item.product_name))";
    const rows = await this.orderItems
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
      .where('order.status != :cancelled', {
        cancelled: OrderStatus.CANCELLED,
      })
      .groupBy(groupKey)
      .orderBy('SUM(item.quantity)', 'DESC')
      .limit(limit)
      .getRawMany<{
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
