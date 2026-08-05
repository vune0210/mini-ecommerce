import { OrderStatus } from '../orders/entities/order.entity';
import { emptyStatusCounts } from '../stats/stats-calculations';
import {
  accountActions,
  averageSpend,
  countableOf,
  customerStatusCounts,
  lifetimeSpend,
} from './account-rules';

describe('customerStatusCounts', () => {
  it('fills missing statuses with zero and ignores unknown ones', () => {
    const counts = customerStatusCounts([
      { status: OrderStatus.PENDING, count: '2' },
      { status: OrderStatus.COMPLETED, count: 3 },
      { status: 'NONSENSE', count: 9 },
    ]);
    expect(counts[OrderStatus.PENDING]).toBe(2);
    expect(counts[OrderStatus.COMPLETED]).toBe(3);
    expect(counts[OrderStatus.SHIPPED]).toBe(0);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(5);
  });
});

describe('countableOf', () => {
  it('excludes PENDING and CANCELLED, matching the revenue report', () => {
    const counts = {
      ...emptyStatusCounts(),
      [OrderStatus.PENDING]: 4,
      [OrderStatus.PAID]: 1,
      [OrderStatus.SHIPPED]: 2,
      [OrderStatus.COMPLETED]: 3,
      [OrderStatus.CANCELLED]: 5,
    };
    expect(countableOf(counts)).toBe(6);
  });
});

describe('lifetimeSpend', () => {
  it('sums only countable statuses', () => {
    expect(
      lifetimeSpend([
        { status: OrderStatus.COMPLETED, sum: '1290000.00' },
        { status: OrderStatus.PAID, sum: '249000.00' },
        { status: OrderStatus.PENDING, sum: '999999.00' },
        { status: OrderStatus.CANCELLED, sum: '888888.00' },
      ]),
    ).toBe('1539000.00');
  });

  /** A customer whose only order was cancelled has spent nothing. */
  it('is zero when nothing countable was bought', () => {
    expect(
      lifetimeSpend([{ status: OrderStatus.CANCELLED, sum: '500000.00' }]),
    ).toBe('0.00');
    expect(lifetimeSpend([])).toBe('0.00');
  });

  it('tolerates a null sum from an empty group', () => {
    expect(lifetimeSpend([{ status: OrderStatus.PAID, sum: null }])).toBe(
      '0.00',
    );
  });
});

describe('averageSpend', () => {
  it('divides by countable orders and never by zero', () => {
    expect(averageSpend('1500000.00', 3)).toBe('500000.00');
    expect(averageSpend('1500000.00', 0)).toBe('0.00');
  });
});

describe('accountActions', () => {
  const none = emptyStatusCounts();

  it('is empty for a customer with nothing to do', () => {
    expect(
      accountActions({
        counts: none,
        reviewableProducts: 0,
        emailVerified: true,
      }),
    ).toEqual([]);
  });

  it('lists the time-sensitive things first', () => {
    expect(
      accountActions({
        counts: {
          ...none,
          [OrderStatus.PENDING]: 1,
          [OrderStatus.SHIPPED]: 2,
        },
        reviewableProducts: 3,
        emailVerified: false,
      }),
    ).toEqual([
      'pending-payment',
      'awaiting-delivery',
      'review-invited',
      'verify-email',
    ]);
  });

  it('nudges verification only when it is actually missing', () => {
    expect(
      accountActions({
        counts: none,
        reviewableProducts: 0,
        emailVerified: false,
      }),
    ).toEqual(['verify-email']);
  });
});
