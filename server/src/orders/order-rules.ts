import { OrderStatus } from './entities/order.entity';

export type StockCheckItem = {
  productId: string;
  productName: string;
  quantity: number;
  available: number;
};
export function stockFailures(items: StockCheckItem[]) {
  return items
    .filter((item) => item.quantity > item.available)
    .map((item) => ({
      productId: item.productId,
      productName: item.productName,
      requested: item.quantity,
      available: item.available,
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
