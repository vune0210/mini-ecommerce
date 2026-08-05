import { OrderStatus } from '../orders/entities/order.entity';
import {
  COUNTABLE,
  emptyStatusCounts,
  StatusCounts,
} from '../stats/stats-calculations';

export type OrderRollupRow = { status: string; count: string | number };

/**
 * Per-status order counts for one customer, reusing the admin rollup's
 * definition of "countable" rather than inventing a second one. A customer
 * reading "you have spent X across N orders" and an admin reading the revenue
 * report must be counting the same orders, or one of the two numbers is a lie.
 */
export function customerStatusCounts(rows: OrderRollupRow[]): StatusCounts {
  const counts = emptyStatusCounts();
  for (const row of rows) {
    const status = row.status as OrderStatus;
    if (status in counts) counts[status] += Number(row.count ?? 0);
  }
  return counts;
}

export function countableOf(counts: StatusCounts): number {
  return (Object.keys(counts) as OrderStatus[])
    .filter((status) => COUNTABLE[status])
    .reduce((total, status) => total + counts[status], 0);
}

/**
 * Lifetime value, rounded to cents. Zero when nothing countable was bought —
 * a customer with only a cancelled order has spent nothing, and reporting the
 * cancelled amount would be the same mistake the revenue report avoids.
 */
export function lifetimeSpend(
  rows: Array<{ status: string; sum: string | null }>,
): string {
  return rows
    .filter((row) => COUNTABLE[row.status as OrderStatus])
    .reduce((total, row) => total + Number(row.sum ?? 0), 0)
    .toFixed(2);
}

export function averageSpend(total: string, orders: number): string {
  if (orders <= 0) return '0.00';
  return (Number(total) / orders).toFixed(2);
}

/**
 * A short list of things the customer can act on right now, ordered by how
 * time-sensitive they are. Deliberately not "everything we know about you":
 * an overview that lists twelve numbers is a report, and nobody reads it.
 */
export type AccountAction =
  'pending-payment' | 'awaiting-delivery' | 'review-invited' | 'verify-email';

export function accountActions(input: {
  counts: StatusCounts;
  reviewableProducts: number;
  emailVerified: boolean;
}): AccountAction[] {
  const actions: AccountAction[] = [];
  if (input.counts[OrderStatus.PENDING] > 0) actions.push('pending-payment');
  if (input.counts[OrderStatus.SHIPPED] > 0) actions.push('awaiting-delivery');
  if (input.reviewableProducts > 0) actions.push('review-invited');
  if (!input.emailVerified) actions.push('verify-email');
  return actions;
}
