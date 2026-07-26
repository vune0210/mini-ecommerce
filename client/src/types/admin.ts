import type { Category, Product } from './catalog';
import type { UserRole } from './auth';
import type { Order, OrderStatus } from './order';

export type CategoryInput = { name: string; slug: string };
export type ProductInput = { name: string; slug: string; description: string; price: number; stock: number; imageUrl?: string; categoryId: string };
export type AdminOrder = Order & { user: { id: string; email: string; name: string } };
export type AdminOrderListResponse = { items: AdminOrder[]; total: number; page: number; limit: number };
export type UpdateOrderStatusInput = { id: string; status: OrderStatus; note?: string };

/** Mirrors server RevenueBreakdown. merchandise − discounts + shipping === net. */
export type RevenueBreakdown = {
  net: string;
  merchandise: string;
  discounts: string;
  shipping: string;
  completed: string;
  cancelled: string;
};

/** One UTC day; only countable statuses (PAID/SHIPPED/COMPLETED) contribute. */
export type DailyPoint = { date: string; orders: number; revenue: string };

export type StatsRange = {
  from: string | null;
  to: string | null;
  timezone: string;
  /** 'series-only' means no from/to was sent: aggregates are all-time. */
  appliesTo: 'all' | 'series-only';
};

export type AdminStats = {
  range: StatsRange;
  revenue: RevenueBreakdown;
  orders: {
    total: number;
    /** Orders counted as revenue — excludes PENDING and CANCELLED. */
    countable: number;
    byStatus: Record<OrderStatus, number>;
    averageOrderValue: string;
  };
  customers: number;
  products: { total: number; outOfStock: number };
  topProducts: Array<{ productId: string | null; productName: string; quantitySold: number; revenue: string }>;
  lowStock: Array<{ id: string; name: string; slug: string; stock: number }>;
  series: DailyPoint[];
};

export type StatsQuery = { from?: string; to?: string };

/** Mirrors server PublicUser — never carries a password hash. */
export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserListResponse = { items: AdminUser[]; total: number; page: number; limit: number };
export type AdminUserQuery = { page: number; search: string; role: '' | UserRole; isActive: '' | 'true' | 'false' };

/**
 * Mirrors server VisibleStatusEvent. A null fromStatus marks order creation;
 * actorId is non-null only for admin viewers.
 */
export type OrderStatusEvent = {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorRole: string | null;
  actorId: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string;
};

export type ExportKind = 'orders' | 'products';
export type ExportQuery = { from?: string; to?: string; status?: '' | OrderStatus };

export type AdminProduct = Product;
export type AdminCategory = Category;
