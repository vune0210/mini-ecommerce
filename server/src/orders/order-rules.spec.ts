import { OrderStatus } from './entities/order.entity';
import {
  buildOrderNumber,
  formatShippingAddress,
  sortForLocking,
  orderTotal,
  stockFailures,
  validOrderTransition,
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
      { productId: 'a', productName: 'A', requested: 3, available: 2 },
    ]);
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
