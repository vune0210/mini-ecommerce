import type { Order } from './order';

/**
 * Mirrors server ReturnStatus. REFUNDED, REJECTED and CANCELLED are terminal;
 * CANCELLED is reachable by the customer only, REJECTED by staff only.
 */
export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RECEIVED'
  | 'REFUNDED'
  | 'CANCELLED';

export type ReturnReason =
  | 'DAMAGED'
  | 'WRONG_ITEM'
  | 'NOT_AS_DESCRIBED'
  | 'CHANGED_MIND'
  | 'OTHER';

/**
 * One claimed order line. `productName` and `unitPrice` are snapshots of the
 * sale, so a delisted or repriced product does not rewrite the request.
 */
export type ReturnItem = {
  id: string;
  returnRequestId: string;
  orderItemId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  createdAt: string;
  updatedAt: string;
};

/** The order a return disputes — the API loads it without its own lines. */
export type ReturnOrder = Omit<Order, 'items'>;

export type ReturnRequest = {
  id: string;
  orderId: string;
  userId: string;
  requestNumber: string;
  status: ReturnStatus;
  reason: ReturnReason;
  note: string | null;
  /** Frozen when the request is filed, from the prices actually paid. */
  refundAmount: string;
  /** Stamped once, on the first transition into a terminal status. */
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: ReturnItem[];
  order?: ReturnOrder;
};

/** The admin queue also carries the customer behind the request. */
export type AdminReturnRequest = ReturnRequest & {
  user?: { id: string; email: string; name: string };
};

export type ReturnListResponse = {
  items: ReturnRequest[];
  total: number;
  page: number;
  limit: number;
};

export type AdminReturnListResponse = {
  items: AdminReturnRequest[];
  total: number;
  page: number;
  limit: number;
};

export type ReturnLineInput = { orderItemId: string; quantity: number };

export type CreateReturnInput = {
  orderId: string;
  reason: ReturnReason;
  note?: string;
  items: ReturnLineInput[];
};

export type UpdateReturnStatusInput = { id: string; status: ReturnStatus; note?: string };
export type CancelReturnInput = { id: string; note?: string };

/**
 * Mirrors server VisibleReturnStatusEvent. A null fromStatus marks the
 * creation event; actorId is non-null only for admin viewers, owners see the
 * actor as role + display name.
 */
export type ReturnStatusEvent = {
  fromStatus: ReturnStatus | null;
  toStatus: ReturnStatus;
  actorRole: string | null;
  actorId: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string;
};

/**
 * Mirrors server ReturnLineFailure — the lines a 400 or 409 refused.
 * `not-in-order` means the client sent an id the order does not have;
 * `exceeds-remaining` means another request already spoke for those units.
 */
export type ReturnLineFailure = {
  orderItemId: string;
  requested: number;
  remaining: number;
  reason: 'not-in-order' | 'exceeds-remaining';
};

/**
 * What one order line still owes the customer: bought minus everything already
 * claimed by requests that have not been rejected or withdrawn. Computed on the
 * client for the picker; the server re-derives it under a row lock at submit.
 */
export type ReturnableLine = {
  orderItemId: string;
  productName: string;
  unitPrice: string;
  purchased: number;
  claimed: number;
  remaining: number;
};

export type ReturnQuery = { page: number; status: '' | ReturnStatus };
export type AdminReturnQuery = ReturnQuery & { search: string };
