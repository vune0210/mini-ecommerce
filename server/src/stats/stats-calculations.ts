import { OrderStatus } from '../orders/entities/order.entity';

export type StatusCounts = Record<OrderStatus, number>;
export type StatusAmounts = Array<{
  status: string;
  sum: string | number | null;
}>;

export function emptyStatusCounts(): StatusCounts {
  return {
    [OrderStatus.PENDING]: 0,
    [OrderStatus.PAID]: 0,
    [OrderStatus.SHIPPED]: 0,
    [OrderStatus.COMPLETED]: 0,
    [OrderStatus.CANCELLED]: 0,
  };
}

/** Fills every status with zero so the dashboard never has to guess a missing key. */
export function statusCounts(
  rows: Array<{ status: string; count: string | number | null }>,
): StatusCounts {
  const counts = emptyStatusCounts();
  for (const row of rows)
    if (row.status in counts)
      counts[row.status as OrderStatus] = Number(row.count ?? 0);
  return counts;
}

export function totalOrders(counts: StatusCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

export function sumAmounts(values: Array<string | number | null>): string {
  return values
    .reduce<number>((total, value) => total + Number(value ?? 0), 0)
    .toFixed(2);
}

/** Revenue split: net excludes cancelled orders, which are reported separately. */
export function revenueBreakdown(rows: StatusAmounts): {
  net: string;
  completed: string;
  cancelled: string;
} {
  // Raw aggregate rows arrive as plain strings, so compare on the enum's value.
  const hasStatus = (row: { status: string }, status: OrderStatus) =>
    row.status === (status as string);
  const amountFor = (status: OrderStatus) =>
    rows.filter((row) => hasStatus(row, status)).map((row) => row.sum);
  return {
    net: sumAmounts(
      rows
        .filter((row) => !hasStatus(row, OrderStatus.CANCELLED))
        .map((row) => row.sum),
    ),
    completed: sumAmounts(amountFor(OrderStatus.COMPLETED)),
    cancelled: sumAmounts(amountFor(OrderStatus.CANCELLED)),
  };
}

export function averageOrderValue(net: string, orderCount: number): string {
  if (orderCount <= 0) return '0.00';
  return (Number(net) / orderCount).toFixed(2);
}
