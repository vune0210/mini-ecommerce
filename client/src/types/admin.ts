import type { Category, Product } from './catalog';
import type { Order, OrderStatus } from './order';
export type CategoryInput = { name: string; slug: string };
export type ProductInput = { name: string; slug: string; description: string; price: number; stock: number; imageUrl?: string; categoryId: string };
export type AdminOrder = Order & { user: { id: string; email: string; name: string } };
export type AdminOrderListResponse = { items: AdminOrder[]; total: number; page: number; limit: number };
export type UpdateOrderStatusInput = { id: string; status: OrderStatus };
export type AdminStats = {
  revenue: { net: string; completed: string; cancelled: string };
  orders: { total: number; byStatus: Record<OrderStatus, number>; averageOrderValue: string };
  customers: number;
  products: { total: number; outOfStock: number };
  topProducts: Array<{ productId: string | null; productName: string; quantitySold: number; revenue: string }>;
  lowStock: Array<{ id: string; name: string; slug: string; stock: number }>;
};
export type AdminProduct = Product;
export type AdminCategory = Category;
