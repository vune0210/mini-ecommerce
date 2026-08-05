import { OrderStatus } from './entities/order.entity';

export type StockCheckItem = {
  productId: string;
  productName: string;
  quantity: number;
  available: number;
  /** True when the product was unpublished or deleted while it sat in the cart. */
  unavailable?: boolean;
};
/**
 * The lines a checkout must refuse, with the reason attached. "Only 2 left" and
 * "no longer sold" send the customer to completely different next actions, and
 * an unpublished product reported as `available: 0` reads as a restock that is
 * never coming.
 */
export function stockFailures(items: StockCheckItem[]) {
  return items
    .filter((item) => item.unavailable || item.quantity > item.available)
    .map((item) => ({
      productId: item.productId,
      productName: item.productName,
      requested: item.quantity,
      available: item.available,
      reason: item.unavailable
        ? ('unavailable' as const)
        : ('insufficient-stock' as const),
    }));
}
/**
 * Deterministic row-lock acquisition order. Two transactions that lock the same
 * products in opposite order deadlock; sorting by id first gives every
 * transaction the same sequence, so one simply waits instead.
 *
 * Compared by code point rather than `localeCompare` on purpose — collation is
 * locale dependent, and two processes disagreeing on the order would reopen the
 * very deadlock this closes. Lines with no product sort last; they are skipped.
 */
export function sortForLocking<T extends { productId: string | null }>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => {
    if (left.productId === right.productId) return 0;
    if (left.productId === null) return 1;
    if (right.productId === null) return -1;
    return left.productId < right.productId ? -1 : 1;
  });
}
export function orderTotal(
  items: Array<{ price: string; quantity: number }>,
): string {
  return items
    .reduce((total, item) => total + Number(item.price) * item.quantity, 0)
    .toFixed(2);
}

export type ShippingPolicy = {
  /** Charged on every order below the threshold. */
  flatFee: string;
  /** Subtotal at or above which delivery is free; null disables the waiver. */
  freeThreshold: string | null;
};

/**
 * A zero fee by default, so an untouched deployment prices exactly as it did
 * before shipping existed. Both values come from the environment, which keeps
 * the number a business decision rather than a redeploy.
 */
export const DEFAULT_SHIPPING_POLICY: ShippingPolicy = {
  flatFee: '0.00',
  freeThreshold: null,
};

/**
 * The threshold compares against the *discounted* subtotal on purpose: a
 * coupon that drops a cart under the free-delivery bar should also drop the
 * free delivery, or the discount silently pays for the courier too.
 */
export function shippingFeeFor(
  payableSubtotal: string | number,
  policy: ShippingPolicy = DEFAULT_SHIPPING_POLICY,
): string {
  const fee = Number(policy.flatFee);
  if (!Number.isFinite(fee) || fee <= 0) return '0.00';
  if (policy.freeThreshold !== null) {
    const threshold = Number(policy.freeThreshold);
    if (Number.isFinite(threshold) && Number(payableSubtotal) >= threshold)
      return '0.00';
  }
  return fee.toFixed(2);
}

/**
 * The single definition of what an order costs. Every caller goes through it so
 * the invariant `total = subtotal - discount + shipping` cannot drift between
 * checkout, the CSV export and the revenue rollup.
 *
 * Clamped at zero: a discount larger than the merchandise must not turn
 * shipping into a payout.
 */
export function orderGrandTotal(
  subtotal: string | number,
  discount: string | number,
  shipping: string | number,
): string {
  const total =
    Number(subtotal) - Number(discount ?? 0) + Number(shipping ?? 0);
  return Math.max(0, Math.round((total + Number.EPSILON) * 100) / 100).toFixed(
    2,
  );
}
const ORDER_NUMBER_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ORDER_NUMBER_SUFFIX_LENGTH = 5;
export function buildOrderNumber(
  date: Date,
  random: () => number = Math.random,
): string {
  const stamp = [
    `${date.getUTCFullYear() % 100}`.padStart(2, '0'),
    `${date.getUTCMonth() + 1}`.padStart(2, '0'),
    `${date.getUTCDate()}`.padStart(2, '0'),
  ].join('');
  let suffix = '';
  for (let index = 0; index < ORDER_NUMBER_SUFFIX_LENGTH; index += 1) {
    const position = Math.min(
      Math.floor(random() * ORDER_NUMBER_ALPHABET.length),
      ORDER_NUMBER_ALPHABET.length - 1,
    );
    suffix += ORDER_NUMBER_ALPHABET.charAt(Math.max(position, 0));
  }
  return `ORD-${stamp}-${suffix}`;
}
export function formatShippingAddress(parts: {
  addressLine: string;
  ward?: string | null;
  district?: string | null;
  city: string;
}): string {
  return [parts.addressLine, parts.ward, parts.district, parts.city]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ');
}
/** Normalizes an optional audit note: trimmed, with blank/absent/null collapsing to null. */
export function historyNote(note?: string | null): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}
export type StatusEventSource = {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorUserId: string | null;
  actorRole: string | null;
  note: string | null;
  createdAt: Date;
  actorUser?: { name: string } | null;
};
export type VisibleStatusEvent = {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorRole: string | null;
  actorId: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: Date;
};
/**
 * Projects a history row into the API event shape. Owners see the actor only
 * as role + display name; the actor's user id is admin-only. A null fromStatus
 * marks the order-creation event, and a deleted actor account leaves id/name
 * null while the actorRole snapshot taken at write time survives.
 */
export function visibleStatusEvent(
  event: StatusEventSource,
  viewerIsAdmin: boolean,
): VisibleStatusEvent {
  return {
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actorRole: event.actorRole,
    actorId: viewerIsAdmin ? event.actorUserId : null,
    actorName: event.actorUser?.name ?? null,
    note: event.note,
    createdAt: event.createdAt,
  };
}
/** Customer-facing Vietnamese wording for each status an order can reach. */
const STATUS_NOTICE: Record<OrderStatus, { title: string; body: string }> = {
  PENDING: {
    title: 'Đơn hàng đã được tạo',
    body: 'Chúng tôi đã nhận đơn của bạn và đang chờ thanh toán.',
  },
  PAID: {
    title: 'Đã nhận thanh toán',
    body: 'Đơn hàng của bạn đã được thanh toán và đang chuẩn bị giao.',
  },
  SHIPPED: {
    title: 'Đơn hàng đang giao',
    body: 'Đơn hàng của bạn đã được bàn giao cho đơn vị vận chuyển.',
  },
  COMPLETED: {
    title: 'Đơn hàng hoàn tất',
    body: 'Cảm ơn bạn! Bạn có thể đánh giá sản phẩm đã mua.',
  },
  CANCELLED: {
    title: 'Đơn hàng đã huỷ',
    body: 'Đơn hàng đã được huỷ và hàng đã được trả về kho.',
  },
};

/**
 * The notification an order transition should produce, or null when it should
 * produce none.
 *
 * Two silences are deliberate. A customer who just cancelled their own order
 * does not need to be told they cancelled it — the inbox is for things that
 * happened *to* them, and self-inflicted noise is what trains people to ignore
 * it. And the PENDING creation event is skipped here because checkout emits its
 * own receipt; sending both would double-notify every order ever placed.
 */
export function orderStatusNotice(
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  actorId: string,
  ownerId: string,
): { title: string; body: string } | null {
  if (fromStatus === null) return null;
  if (actorId === ownerId) return null;
  return STATUS_NOTICE[toStatus];
}

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.PAID, OrderStatus.CANCELLED],
  PAID: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [OrderStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};
export function validOrderTransition(
  current: OrderStatus,
  next: OrderStatus,
): boolean {
  return transitions[current].includes(next);
}
