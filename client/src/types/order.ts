export type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
export type PaymentMethod = 'COD' | 'BANK_TRANSFER';
export type OrderItem = { id: string; productId: string | null; productName: string; unitPrice: string; quantity: number; subtotal: string; createdAt: string; updatedAt: string };
export type Order = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** Invariant: totalAmount === subtotalAmount − discountAmount + shippingFee. */
  totalAmount: string;
  subtotalAmount: string;
  discountAmount: string;
  shippingFee: string;
  /** Null once the coupon row is deleted; couponCode survives as the record. */
  couponId: string | null;
  couponCode: string | null;
  paymentMethod: PaymentMethod;
  /** Stamped once, the first time the order reached PAID. */
  paidAt: string | null;
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

/** Either name a saved address, or spell the destination out inline. */
export type CheckoutInput = {
  addressId?: string;
  recipientName?: string;
  phone?: string;
  addressLine?: string;
  ward?: string;
  district?: string;
  city?: string;
  note?: string;
  couponCode?: string;
  paymentMethod?: PaymentMethod;
};

/**
 * A 409 from checkout names the offending lines. `unavailable` and
 * `insufficient-stock` send the customer to different next actions.
 */
export type CheckoutConflictItem = {
  productId: string;
  productName: string;
  requested: number;
  available: number;
  reason: 'unavailable' | 'insufficient-stock';
};
export type OrderListResponse = { items: Order[]; total: number; page: number; limit: number };
