export type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
export type OrderItem = { id: string; productId: string | null; productName: string; unitPrice: string; quantity: number; subtotal: string; createdAt: string; updatedAt: string };
export type Order = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: string;
  recipientName: string;
  phone: string;
  addressLine: string;
  ward: string | null;
  district: string | null;
  city: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
};
export type CheckoutInput = {
  recipientName: string;
  phone: string;
  addressLine: string;
  ward?: string;
  district?: string;
  city: string;
  note?: string;
};
export type OrderListResponse = { items: Order[]; total: number; page: number; limit: number };
