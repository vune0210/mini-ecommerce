import { OrderStatus } from '../orders/entities/order.entity';
import {
  averageOrderValue,
  COUNTABLE,
  countableOrders,
  csvCell,
  csvLine,
  dailySeries,
  emptyStatusCounts,
  exportFilename,
  ORDER_EXPORT_COLUMNS,
  orderCsvRows,
  productCsvRow,
  reportingRange,
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

  it('counts only PAID, SHIPPED and COMPLETED orders as countable', () => {
    expect(COUNTABLE[OrderStatus.PENDING]).toBe(false);
    expect(COUNTABLE[OrderStatus.CANCELLED]).toBe(false);
    const counts = {
      ...emptyStatusCounts(),
      [OrderStatus.PENDING]: 4,
      [OrderStatus.PAID]: 2,
      [OrderStatus.SHIPPED]: 1,
      [OrderStatus.COMPLETED]: 3,
      [OrderStatus.CANCELLED]: 5,
    };
    expect(countableOrders(counts)).toBe(6);
    expect(totalOrders(counts)).toBe(15);
  });

  it('excludes PENDING and CANCELLED from net revenue but keeps PAID and SHIPPED', () => {
    const revenue = revenueBreakdown([
      {
        status: OrderStatus.PENDING,
        sum: '10.00',
        subtotal: '10.00',
        discount: '0.00',
        shipping: '0.00',
      },
      {
        status: OrderStatus.PAID,
        sum: '40.00',
        subtotal: '38.00',
        discount: '3.00',
        shipping: '5.00',
      },
      {
        status: OrderStatus.SHIPPED,
        sum: '5.00',
        subtotal: '5.00',
        discount: '0.00',
        shipping: '0.00',
      },
      {
        status: OrderStatus.COMPLETED,
        sum: '25.50',
        subtotal: '24.00',
        discount: '1.50',
        shipping: '3.00',
      },
      {
        status: OrderStatus.CANCELLED,
        sum: '99.00',
        subtotal: '99.00',
        discount: '0.00',
        shipping: '0.00',
      },
    ]);
    expect(revenue).toEqual({
      net: '70.50',
      merchandise: '67.00',
      discounts: '4.50',
      shipping: '8.00',
      completed: '25.50',
      cancelled: '99.00',
    });
    // The pinned invariant: merchandise − discounts + shipping === net.
    expect(
      (
        Number(revenue.merchandise) -
        Number(revenue.discounts) +
        Number(revenue.shipping)
      ).toFixed(2),
    ).toBe(revenue.net);
  });

  it('treats missing money columns as zero so legacy rollups still resolve', () => {
    expect(
      revenueBreakdown([{ status: OrderStatus.COMPLETED, sum: '25.50' }]),
    ).toEqual({
      net: '25.50',
      merchandise: '0.00',
      discounts: '0.00',
      shipping: '0.00',
      completed: '25.50',
      cancelled: '0.00',
    });
  });

  it('guards the average order value against a zero divisor', () => {
    expect(averageOrderValue('35.50', 2)).toBe('17.75');
    expect(averageOrderValue('0.00', 0)).toBe('0.00');
  });
});

describe('reportingRange', () => {
  const today = new Date('2026-07-26T12:00:00.000Z');

  it('builds half-open bounds for an explicit range', () => {
    expect(reportingRange('2026-07-01', '2026-07-31', 'UTC', today)).toEqual({
      valid: true,
      from: '2026-07-01',
      to: '2026-07-31',
      timezone: 'UTC',
      appliesTo: 'all',
      fromBound: '2026-07-01 00:00:00',
      toBound: '2026-08-01 00:00:00',
      seriesFrom: '2026-07-01',
      seriesTo: '2026-07-31',
      seriesFromBound: '2026-07-01 00:00:00',
      seriesToBound: '2026-08-01 00:00:00',
    });
  });

  it('falls back to a trailing 30-day series when no bounds are given', () => {
    expect(reportingRange(undefined, undefined, 'UTC', today)).toEqual({
      valid: true,
      from: null,
      to: null,
      timezone: 'UTC',
      appliesTo: 'series-only',
      fromBound: null,
      toBound: null,
      seriesFrom: '2026-06-27',
      seriesTo: '2026-07-26',
      seriesFromBound: '2026-06-27 00:00:00',
      seriesToBound: '2026-07-27 00:00:00',
    });
  });

  it('leaves the other side open when only one bound is given', () => {
    const fromOnly = reportingRange('2026-07-01', undefined, 'UTC', today);
    if (!fromOnly.valid) throw new Error('expected a valid range');
    expect(fromOnly.appliesTo).toBe('all');
    expect(fromOnly.fromBound).toBe('2026-07-01 00:00:00');
    expect(fromOnly.toBound).toBeNull();
    expect(fromOnly.seriesTo).toBe('2026-07-26');

    const toOnly = reportingRange(undefined, '2026-07-10', 'UTC', today);
    if (!toOnly.valid) throw new Error('expected a valid range');
    expect(toOnly.appliesTo).toBe('all');
    expect(toOnly.fromBound).toBeNull();
    expect(toOnly.toBound).toBe('2026-07-11 00:00:00');
    expect(toOnly.seriesFrom).toBe('2026-06-11');
    expect(toOnly.seriesTo).toBe('2026-07-10');
  });

  it('rejects invalid calendar days instead of rolling them over', () => {
    expect(reportingRange('2026-02-30', undefined, 'UTC', today)).toEqual({
      valid: false,
      error: 'from must be a valid calendar day',
    });
    expect(reportingRange(undefined, '2026-13-01', 'UTC', today)).toEqual({
      valid: false,
      error: 'to must be a valid calendar day',
    });
    expect(reportingRange('2026-7-1', undefined, 'UTC', today)).toEqual({
      valid: false,
      error: 'from must be a valid calendar day',
    });
  });

  it('rejects an inverted range', () => {
    expect(reportingRange('2026-07-10', '2026-07-01', 'UTC', today)).toEqual({
      valid: false,
      error: 'from must not be after to',
    });
  });
});

describe('dailySeries', () => {
  it('fills empty days with zero across month boundaries', () => {
    expect(
      dailySeries(
        [{ day: '2026-06-30', orders: '2', revenue: '50.00' }],
        '2026-06-29',
        '2026-07-01',
      ),
    ).toEqual([
      { date: '2026-06-29', orders: 0, revenue: '0.00' },
      { date: '2026-06-30', orders: 2, revenue: '50.00' },
      { date: '2026-07-01', orders: 0, revenue: '0.00' },
    ]);
  });

  it('coerces raw string counts and null sums', () => {
    expect(
      dailySeries(
        [{ day: '2026-07-01', orders: '3', revenue: null }],
        '2026-07-01',
        '2026-07-01',
      ),
    ).toEqual([{ date: '2026-07-01', orders: 3, revenue: '0.00' }]);
  });

  it('returns an empty series for an inverted or malformed window', () => {
    expect(dailySeries([], '2026-07-02', '2026-07-01')).toEqual([]);
    expect(dailySeries([], 'not-a-day', '2026-07-01')).toEqual([]);
  });
});

describe('csv serialization', () => {
  it('escapes quotes, commas and newlines per RFC 4180', () => {
    expect(csvLine(['plain', 'a,b', 'say "hi"', 'line\nbreak'])).toBe(
      'plain,"a,b","say ""hi""","line\nbreak"\r\n',
    );
  });

  it('neutralizes leading formula characters for spreadsheet safety', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+84 900')).toBe("'+84 900");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });

  it('serializes blanks, numbers and dates', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(3)).toBe('3');
    expect(csvCell(new Date('2026-07-26T03:04:05.000Z'))).toBe(
      '2026-07-26T03:04:05.000Z',
    );
  });

  it('keeps the order header aligned with the row builder', () => {
    expect(ORDER_EXPORT_COLUMNS).toHaveLength(21);
    expect(csvLine(ORDER_EXPORT_COLUMNS)).toBe(
      'order_number,status,created_at,customer_email,recipient_name,phone,address_line,ward,district,city,order_total,order_subtotal,order_discount,order_shipping,coupon_code,product_name,variant_sku,variant_name,unit_price,quantity,line_subtotal\r\n',
    );
  });

  it('emits one aligned row per line item with order fields repeated', () => {
    const rows = orderCsvRows({
      orderNumber: 'ORD-260726-AAAAA',
      status: 'COMPLETED',
      createdAt: new Date('2026-07-26T03:04:05.000Z'),
      totalAmount: '25.00',
      subtotalAmount: '20.00',
      discountAmount: '0.00',
      shippingFee: '5.00',
      couponCode: 'SALE10',
      recipientName: 'Nguyen, "Van" A',
      phone: '0900000000',
      addressLine: '1 Main St',
      ward: null,
      district: null,
      city: 'ho chi minh',
      user: { email: 'buyer@example.com' },
      items: [
        {
          productName: 'Ao thun',
          variantSku: 'SKU-1',
          variantName: 'Size M',
          unitPrice: '10.00',
          quantity: 2,
          subtotal: '20.00',
        },
        {
          productName: 'Legacy item',
          unitPrice: '5.00',
          quantity: 1,
          subtotal: '5.00',
        },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe(
      'ORD-260726-AAAAA,COMPLETED,2026-07-26T03:04:05.000Z,buyer@example.com,"Nguyen, ""Van"" A",0900000000,1 Main St,,,ho chi minh,25.00,20.00,0.00,5.00,SALE10,Ao thun,SKU-1,Size M,10.00,2,20.00\r\n',
    );
    // Legacy/no-variant lines keep empty variant cells so columns stay aligned.
    expect(rows[1]).toBe(
      'ORD-260726-AAAAA,COMPLETED,2026-07-26T03:04:05.000Z,buyer@example.com,"Nguyen, ""Van"" A",0900000000,1 Main St,,,ho chi minh,25.00,20.00,0.00,5.00,SALE10,Legacy item,,,5.00,1,5.00\r\n',
    );
  });

  it('leaves money-breakdown cells empty for pre-restructure orders', () => {
    const [row] = orderCsvRows({
      orderNumber: 'ORD-LEGACY-1',
      status: 'PAID',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      totalAmount: '9.99',
      recipientName: 'A',
      phone: '0',
      addressLine: 'B',
      city: 'C',
      items: [
        { productName: 'P', unitPrice: '9.99', quantity: 1, subtotal: '9.99' },
      ],
    });
    expect(row.split(',')).toHaveLength(ORDER_EXPORT_COLUMNS.length);
    expect(row).toBe(
      'ORD-LEGACY-1,PAID,2026-01-01T00:00:00.000Z,,A,0,B,,,C,9.99,,,,,P,,,9.99,1,9.99\r\n',
    );
  });

  it('serializes a product row with its category name', () => {
    expect(
      productCsvRow({
        id: 'p-1',
        name: 'Ao thun',
        slug: 'ao-thun',
        price: '19.99',
        stock: 4,
        imageUrl: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        category: { name: 'Ao' },
      }),
    ).toBe('p-1,Ao thun,ao-thun,Ao,19.99,4,,2026-07-01T00:00:00.000Z\r\n');
  });

  it('dates the export filename', () => {
    expect(exportFilename('orders', new Date('2026-07-26T23:59:59.000Z'))).toBe(
      'orders-2026-07-26.csv',
    );
  });
});
