import {
  couponDiscount,
  couponRejection,
  normalizeCouponCode,
  serializeCoupon,
} from './coupon-rules';
import { Coupon, CouponType } from './entities/coupon.entity';

const now = new Date('2026-07-26T10:00:00.000Z');

function coupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'coupon-1',
    code: 'SALE10',
    description: null,
    type: CouponType.PERCENT,
    value: '10.00',
    minSubtotal: null,
    maxDiscount: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    perUserLimit: null,
    isActive: true,
    isPublic: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('normalizeCouponCode', () => {
  it('upper-cases and trims', () => {
    expect(normalizeCouponCode('  sale10 ')).toBe('SALE10');
  });
});

describe('couponDiscount', () => {
  it('takes a percentage of the subtotal, rounded to cents', () => {
    expect(couponDiscount(coupon({ value: '10.00' }), '1290000.00')).toBe(
      '129000.00',
    );
    expect(couponDiscount(coupon({ value: '7.50' }), '333.33')).toBe('25.00');
  });

  it('subtracts a fixed amount', () => {
    expect(
      couponDiscount(
        coupon({ type: CouponType.FIXED, value: '50000.00' }),
        '249000.00',
      ),
    ).toBe('50000.00');
  });

  /** A negative order total is not a refund. */
  it('never discounts more than the subtotal', () => {
    expect(
      couponDiscount(
        coupon({ type: CouponType.FIXED, value: '100000.00' }),
        '60000.00',
      ),
    ).toBe('60000.00');
  });

  it('honours the percentage cap', () => {
    expect(
      couponDiscount(
        coupon({ value: '50.00', maxDiscount: '100000.00' }),
        '1290000.00',
      ),
    ).toBe('100000.00');
  });

  it('returns nothing for an empty or nonsense subtotal', () => {
    expect(couponDiscount(coupon(), '0.00')).toBe('0.00');
    expect(couponDiscount(coupon(), 'not-a-number')).toBe('0.00');
  });

  /** total = subtotal - discount + shipping must hold to the cent. */
  it('always lands on exactly two decimals', () => {
    for (const subtotal of ['0.01', '10.05', '999999.99', '1234.56']) {
      expect(couponDiscount(coupon({ value: '33.00' }), subtotal)).toMatch(
        /^\d+\.\d{2}$/,
      );
    }
  });
});

describe('couponRejection', () => {
  const context = { now, subtotal: '500000.00', userRedemptions: 0 };

  it('accepts a healthy coupon', () => {
    expect(couponRejection(coupon(), context)).toBeNull();
  });

  it('rejects a disabled coupon', () => {
    expect(couponRejection(coupon({ isActive: false }), context)).toBe(
      'Coupon is not available',
    );
  });

  it('rejects a coupon whose window has not opened', () => {
    expect(
      couponRejection(
        coupon({ startsAt: new Date('2026-07-27T00:00:00.000Z') }),
        context,
      ),
    ).toBe('Coupon is not active yet');
  });

  it('treats the end bound as exclusive', () => {
    expect(couponRejection(coupon({ endsAt: now }), context)).toBe(
      'Coupon has expired',
    );
    expect(
      couponRejection(coupon({ endsAt: new Date(now.getTime() + 1) }), context),
    ).toBeNull();
  });

  it('rejects an exhausted coupon', () => {
    expect(
      couponRejection(coupon({ usageLimit: 5, usageCount: 5 }), context),
    ).toBe('Coupon has reached its usage limit');
  });

  it('rejects a customer who already used their allowance', () => {
    expect(
      couponRejection(coupon({ perUserLimit: 1 }), {
        ...context,
        userRedemptions: 1,
      }),
    ).toBe('You have already used this coupon');
  });

  it('explains the minimum subtotal so the customer can act on it', () => {
    expect(couponRejection(coupon({ minSubtotal: '600000.00' }), context)).toBe(
      'Order subtotal must be at least 600000.00 to use this coupon',
    );
  });

  /** Existence problems outrank the one the customer could fix by spending more. */
  it('reports expiry ahead of the subtotal shortfall', () => {
    expect(
      couponRejection(
        coupon({ endsAt: now, minSubtotal: '600000.00' }),
        context,
      ),
    ).toBe('Coupon has expired');
  });
});

describe('serializeCoupon', () => {
  it('withholds usage counters from customers', () => {
    const projection = serializeCoupon(
      coupon({ usageLimit: 100, usageCount: 3, perUserLimit: 1 }),
    );
    expect(projection).not.toHaveProperty('usageCount');
    expect(projection).not.toHaveProperty('usageLimit');
    expect(projection).not.toHaveProperty('perUserLimit');
    expect(projection).not.toHaveProperty('id');
    expect(projection.code).toBe('SALE10');
  });
});
