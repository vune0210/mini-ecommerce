import { OrderStatus } from '../orders/entities/order.entity';
import {
  averageOrderValue,
  emptyStatusCounts,
  revenueBreakdown,
  statusCounts,
  sumAmounts,
  totalOrders,
} from './stats-calculations';

describe('stats calculations', () => {
  it('fills missing statuses with zero and ignores unknown ones', () => {
    const counts = statusCounts([
      { status: OrderStatus.PENDING, count: '3' },
      { status: OrderStatus.COMPLETED, count: 2 },
      { status: 'ARCHIVED', count: '7' },
    ]);
    expect(counts).toEqual({
      ...emptyStatusCounts(),
      [OrderStatus.PENDING]: 3,
      [OrderStatus.COMPLETED]: 2,
    });
    expect(totalOrders(counts)).toBe(5);
  });

  it('sums decimal strings to two places and tolerates nulls', () => {
    expect(sumAmounts(['12.50', 3.25, null])).toBe('15.75');
    expect(sumAmounts([])).toBe('0.00');
  });

  it('excludes cancelled orders from net revenue', () => {
    expect(
      revenueBreakdown([
        { status: OrderStatus.PENDING, sum: '10.00' },
        { status: OrderStatus.COMPLETED, sum: '25.50' },
        { status: OrderStatus.CANCELLED, sum: '99.00' },
      ]),
    ).toEqual({ net: '35.50', completed: '25.50', cancelled: '99.00' });
  });

  it('guards the average order value against a zero divisor', () => {
    expect(averageOrderValue('35.50', 2)).toBe('17.75');
    expect(averageOrderValue('0.00', 0)).toBe('0.00');
  });
});
