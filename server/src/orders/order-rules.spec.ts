import { OrderStatus } from './entities/order.entity';
import {
  buildOrderNumber,
  formatShippingAddress,
  historyNote,
  orderGrandTotal,
  orderStatusNotice,
  sortForLocking,
  orderTotal,
  shippingFeeFor,
  stockFailures,
  validOrderTransition,
  visibleStatusEvent,
} from './order-rules';
describe('order rules', () => {
  it('orders row locks by product id so concurrent writers agree', () => {
    const items = [{ productId: 'b' }, { productId: 'a' }, { productId: 'c' }];
    expect(sortForLocking(items).map((item) => item.productId)).toEqual([
      'a',
      'b',
      'c',
    ]);
    // Reversing the input must not change the acquisition order — that is the
    // entire point: two carts holding the same products cannot deadlock.
    expect(
      sortForLocking([...items].reverse()).map((item) => item.productId),
    ).toEqual(['a', 'b', 'c']);
  });
  it('sorts lines with a deleted product last and leaves the input alone', () => {
    const items = [{ productId: null }, { productId: 'b' }, { productId: 'a' }];
    expect(sortForLocking(items).map((item) => item.productId)).toEqual([
      'a',
      'b',
      null,
    ]);
    expect(items[0].productId).toBeNull();
  });
  it('sorts by code point, not locale collation', () => {
    // A locale-aware comparator can rank 'Z' before 'a'; two processes with
    // different locales would then lock in different orders and deadlock.
    const items = [{ productId: 'a' }, { productId: 'Z' }];
    expect(sortForLocking(items).map((item) => item.productId)).toEqual([
      'Z',
      'a',
    ]);
  });
  it('builds a dated order number and stays inside the alphabet', () => {
    const date = new Date('2026-07-26T10:00:00.000Z');
    expect(buildOrderNumber(date, () => 0)).toBe('ORD-260726-00000');
    expect(buildOrderNumber(date, () => 0.999999)).toBe('ORD-260726-ZZZZZ');
    // A random() of exactly 1 must not fall off the end of the alphabet.
    expect(buildOrderNumber(date, () => 1)).toBe('ORD-260726-ZZZZZ');
    expect(
      buildOrderNumber(new Date('2026-01-05T00:00:00.000Z'), () => 0),
    ).toBe('ORD-260105-00000');
  });
  it('joins only the shipping parts that are present', () => {
    expect(
      formatShippingAddress({
        addressLine: '12 Nguyen Hue',
        ward: '  ',
        district: 'Quan 1',
        city: 'Ho Chi Minh',
      }),
    ).toBe('12 Nguyen Hue, Quan 1, Ho Chi Minh');
    expect(
      formatShippingAddress({
        addressLine: '12 Nguyen Hue',
        ward: null,
        district: null,
        city: 'Ho Chi Minh',
      }),
    ).toBe('12 Nguyen Hue, Ho Chi Minh');
  });
  it('calculates order total and identifies stock failures', () => {
    expect(
      orderTotal([
        { price: '12.50', quantity: 2 },
        { price: '3.25', quantity: 3 },
      ]),
    ).toBe('34.75');
    expect(
      stockFailures([
        { productId: 'a', productName: 'A', quantity: 3, available: 2 },
        { productId: 'b', productName: 'B', quantity: 1, available: 1 },
      ]),
    ).toEqual([
      {
        productId: 'a',
        productName: 'A',
        requested: 3,
        available: 2,
        reason: 'insufficient-stock',
      },
    ]);
  });

  /**
   * "Only 2 left" and "no longer sold" send the customer to different actions,
   * so an unpublished product must not be reported as a stock shortfall.
   */
  it('separates an unavailable product from a stock shortfall', () => {
    expect(
      stockFailures([
        {
          productId: 'gone',
          productName: 'Gone',
          quantity: 1,
          available: 9,
          unavailable: true,
        },
      ]),
    ).toEqual([
      {
        productId: 'gone',
        productName: 'Gone',
        requested: 1,
        available: 9,
        reason: 'unavailable',
      },
    ]);
  });

  describe('shippingFeeFor', () => {
    it('is free when no policy is configured', () => {
      expect(shippingFeeFor('1000000.00')).toBe('0.00');
    });

    it('charges the flat fee below the threshold', () => {
      expect(
        shippingFeeFor('200000.00', {
          flatFee: '30000',
          freeThreshold: '500000',
        }),
      ).toBe('30000.00');
    });

    it('waives the fee at the threshold, not just above it', () => {
      const policy = { flatFee: '30000', freeThreshold: '500000' };
      expect(shippingFeeFor('500000.00', policy)).toBe('0.00');
      expect(shippingFeeFor('499999.99', policy)).toBe('30000.00');
    });

    it('charges every order when no threshold is set', () => {
      expect(
        shippingFeeFor('9999999.00', { flatFee: '30000', freeThreshold: null }),
      ).toBe('30000.00');
    });

    it('ignores a malformed fee rather than charging NaN', () => {
      expect(
        shippingFeeFor('100.00', { flatFee: 'free', freeThreshold: null }),
      ).toBe('0.00');
    });
  });

  describe('orderGrandTotal', () => {
    it('applies the discount before adding shipping', () => {
      expect(orderGrandTotal('500000.00', '50000.00', '30000.00')).toBe(
        '480000.00',
      );
    });

    it('never returns a negative total', () => {
      expect(orderGrandTotal('10.00', '999.00', '0.00')).toBe('0.00');
    });

    it('always lands on two decimals', () => {
      expect(orderGrandTotal('0.1', '0', '0.2')).toBe('0.30');
    });
  });
  it('normalizes history notes to trimmed text or null', () => {
    expect(historyNote('  Payment confirmed  ')).toBe('Payment confirmed');
    expect(historyNote('   ')).toBeNull();
    expect(historyNote('')).toBeNull();
    expect(historyNote(undefined)).toBeNull();
    expect(historyNote(null)).toBeNull();
  });
  it('redacts the actor id from owner-facing status events', () => {
    const event = {
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.PAID,
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
      note: 'Paid by bank transfer',
      createdAt: new Date('2026-07-26T10:00:00.000Z'),
      actorUser: { name: 'Ops Admin' },
    };
    // Owners still learn who acted (role + display name) — just never the id.
    expect(visibleStatusEvent(event, false)).toEqual({
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.PAID,
      actorRole: 'ADMIN',
      actorId: null,
      actorName: 'Ops Admin',
      note: 'Paid by bank transfer',
      createdAt: new Date('2026-07-26T10:00:00.000Z'),
    });
    expect(visibleStatusEvent(event, true).actorId).toBe('admin-1');
  });
  it('keeps the role snapshot when the actor account was deleted', () => {
    // actor_user_id is ON DELETE SET NULL; the varchar role snapshot survives.
    const event = {
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      actorUserId: null,
      actorRole: 'CUSTOMER',
      note: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      actorUser: null,
    };
    expect(visibleStatusEvent(event, true)).toEqual({
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      actorRole: 'CUSTOMER',
      actorId: null,
      actorName: null,
      note: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    });
  });
  it('allows only forward lifecycle transitions', () => {
    expect(validOrderTransition(OrderStatus.PENDING, OrderStatus.PAID)).toBe(
      true,
    );
    expect(validOrderTransition(OrderStatus.PAID, OrderStatus.CANCELLED)).toBe(
      true,
    );
    expect(
      validOrderTransition(OrderStatus.COMPLETED, OrderStatus.PENDING),
    ).toBe(false);
  });
});

describe('orderStatusNotice', () => {
  const owner = 'customer-1';
  const admin = 'admin-1';

  it('describes a staff-driven transition to the owner', () => {
    expect(
      orderStatusNotice(OrderStatus.PENDING, OrderStatus.PAID, admin, owner),
    ).toEqual({
      title: 'Đã nhận thanh toán',
      body: 'Đơn hàng của bạn đã được thanh toán và đang chuẩn bị giao.',
    });
  });

  /** The inbox is for things that happened *to* you, not things you just did. */
  it('stays silent when the owner acted on their own order', () => {
    expect(
      orderStatusNotice(
        OrderStatus.PENDING,
        OrderStatus.CANCELLED,
        owner,
        owner,
      ),
    ).toBeNull();
  });

  /** Checkout emits its own receipt; this would make it two. */
  it('stays silent on the creation event', () => {
    expect(
      orderStatusNotice(null, OrderStatus.PENDING, owner, owner),
    ).toBeNull();
    expect(
      orderStatusNotice(null, OrderStatus.PENDING, admin, owner),
    ).toBeNull();
  });

  it('has wording for every status an order can reach', () => {
    for (const status of Object.values(OrderStatus)) {
      const notice = orderStatusNotice(
        OrderStatus.PENDING,
        status,
        admin,
        owner,
      );
      expect(notice?.title).toBeTruthy();
      expect(notice?.body).toBeTruthy();
    }
  });
});
