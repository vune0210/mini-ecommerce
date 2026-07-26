import { OrderStatus } from '../orders/entities/order.entity';

export type StatusCounts = Record<OrderStatus, number>;
export type StatusAmounts = Array<{
  status: string;
  sum: string | number | null;
  subtotal?: string | number | null;
  discount?: string | number | null;
  shipping?: string | number | null;
}>;

/**
 * Statuses that count toward revenue and sales figures. PENDING money has not
 * been collected yet and CANCELLED money went back to the customer, so neither
 * is countable. The exhaustive Record makes adding a sixth OrderStatus a
 * compile error here instead of a silently wrong dashboard.
 */
export const COUNTABLE: Record<OrderStatus, boolean> = {
  [OrderStatus.PENDING]: false,
  [OrderStatus.PAID]: true,
  [OrderStatus.SHIPPED]: true,
  [OrderStatus.COMPLETED]: true,
  [OrderStatus.CANCELLED]: false,
};

export const COUNTABLE_ORDER_STATUSES: OrderStatus[] = Object.values(
  OrderStatus,
).filter((status) => COUNTABLE[status]);

/** Every reporting bucket is a UTC calendar day; docker runs backend and MySQL with TZ=UTC. */
export const REPORTING_TIMEZONE = 'UTC';

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

/** Orders whose money actually counts — see COUNTABLE. */
export function countableOrders(counts: StatusCounts): number {
  return (Object.keys(counts) as OrderStatus[])
    .filter((status) => COUNTABLE[status])
    .reduce((total, status) => total + counts[status], 0);
}

export function sumAmounts(values: Array<string | number | null>): string {
  return values
    .reduce<number>((total, value) => total + Number(value ?? 0), 0)
    .toFixed(2);
}

export type RevenueBreakdown = {
  net: string;
  merchandise: string;
  discounts: string;
  shipping: string;
  completed: string;
  cancelled: string;
};

/**
 * Revenue split over countable statuses only: net/merchandise/discounts/shipping
 * all exclude PENDING (uncollected) and CANCELLED (returned) orders, which are
 * reported in their own buckets. Invariant: merchandise − discounts + shipping
 * === net, because each order satisfies total = subtotal − discount + shipping.
 */
export function revenueBreakdown(rows: StatusAmounts): RevenueBreakdown {
  // Raw aggregate rows arrive as plain strings, so compare on the enum's value.
  const hasStatus = (row: { status: string }, status: OrderStatus) =>
    row.status === (status as string);
  const countable = rows.filter(
    (row) => row.status in COUNTABLE && COUNTABLE[row.status as OrderStatus],
  );
  const amountFor = (status: OrderStatus) =>
    rows.filter((row) => hasStatus(row, status)).map((row) => row.sum);
  return {
    net: sumAmounts(countable.map((row) => row.sum)),
    merchandise: sumAmounts(countable.map((row) => row.subtotal ?? null)),
    discounts: sumAmounts(countable.map((row) => row.discount ?? null)),
    shipping: sumAmounts(countable.map((row) => row.shipping ?? null)),
    completed: sumAmounts(amountFor(OrderStatus.COMPLETED)),
    cancelled: sumAmounts(amountFor(OrderStatus.CANCELLED)),
  };
}

export function averageOrderValue(net: string, orderCount: number): string {
  if (orderCount <= 0) return '0.00';
  return (Number(net) / orderCount).toFixed(2);
}

export type ResolvedRange = {
  valid: true;
  /** Echo of the requested bounds; null when the caller omitted them. */
  from: string | null;
  to: string | null;
  timezone: string;
  /** 'series-only': no bounds given — aggregates are all-time, series trails 30 days. */
  appliesTo: 'all' | 'series-only';
  /** Half-open SQL predicate bounds: created_at >= fromBound AND created_at < toBound. */
  fromBound: string | null;
  toBound: string | null;
  /** The daily series always spans a finite, inclusive day window. */
  seriesFrom: string;
  seriesTo: string;
  seriesFromBound: string;
  seriesToBound: string;
};
export type InvalidRange = { valid: false; error: string };
export type ReportingRange = ResolvedRange | InvalidRange;

/** The series window when the caller gives no explicit range. */
export const TRAILING_SERIES_DAYS = 30;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Date.parse alone is not enough: V8 rolls 2026-02-30 over to March 2 rather
 * than rejecting it, so the parsed date must round-trip to the input string.
 */
function validDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Day arithmetic in UTC so a container's local clock can never shift a bucket. */
export function shiftDay(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + offset))
    .toISOString()
    .slice(0, 10);
}

function dayStart(day: string): string {
  return `${day} 00:00:00`;
}

/**
 * Resolves the requested calendar-day range into half-open SQL bounds plus the
 * finite window the daily series must fill. Invalid input never throws — the
 * caller turns { valid: false } into its own 400.
 */
export function reportingRange(
  from: string | undefined,
  to: string | undefined,
  timezone: string = REPORTING_TIMEZONE,
  today: Date = new Date(),
): ReportingRange {
  if (from !== undefined && !validDay(from))
    return { valid: false, error: 'from must be a valid calendar day' };
  if (to !== undefined && !validDay(to))
    return { valid: false, error: 'to must be a valid calendar day' };
  if (from !== undefined && to !== undefined && from > to)
    return { valid: false, error: 'from must not be after to' };
  const todayDay = today.toISOString().slice(0, 10);
  const seriesTo = to ?? todayDay;
  const seriesFrom = from ?? shiftDay(seriesTo, 1 - TRAILING_SERIES_DAYS);
  return {
    valid: true,
    from: from ?? null,
    to: to ?? null,
    timezone,
    appliesTo: from !== undefined || to !== undefined ? 'all' : 'series-only',
    fromBound: from !== undefined ? dayStart(from) : null,
    toBound: to !== undefined ? dayStart(shiftDay(to, 1)) : null,
    seriesFrom,
    seriesTo,
    seriesFromBound: dayStart(seriesFrom),
    seriesToBound: dayStart(shiftDay(seriesTo, 1)),
  };
}

/**
 * One point per UTC day. Only countable statuses contribute (the service's
 * query filters on COUNTABLE_ORDER_STATUSES), so a day of PENDING orders shows
 * orders: 0 / revenue '0.00'.
 */
export type DailyPoint = { date: string; orders: number; revenue: string };

/** Fills every day of the window so charts never interpolate across gaps. */
export function dailySeries(
  rows: Array<{
    day: string;
    orders: string | number | null;
    revenue: string | number | null;
  }>,
  from: string,
  to: string,
): DailyPoint[] {
  if (!DAY_PATTERN.test(from) || !DAY_PATTERN.test(to)) return [];
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const series: DailyPoint[] = [];
  for (let day = from; day <= to; day = shiftDay(day, 1)) {
    const row = byDay.get(day);
    series.push({
      date: day,
      orders: Number(row?.orders ?? 0),
      revenue: Number(row?.revenue ?? 0).toFixed(2),
    });
  }
  return series;
}

/** UTF-8 byte-order mark: without it Excel mangles Vietnamese text. */
export const CSV_BOM = '\uFEFF';

type CsvValue = string | number | Date | null | undefined;

/**
 * RFC 4180 cell: quotes doubled, the cell quoted when it holds a comma, quote
 * or line break. A leading =, +, - or @ would execute as a spreadsheet formula
 * when the export is opened in Excel, so it is neutralized with a quote prefix.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

/** CRLF line endings — the RFC 4180 default and what Excel expects. */
export function csvLine(cells: ReadonlyArray<CsvValue>): string {
  return cells.map(csvCell).join(',') + '\r\n';
}

export const ORDER_EXPORT_COLUMNS = [
  'order_number',
  'status',
  'created_at',
  'customer_email',
  'recipient_name',
  'phone',
  'address_line',
  'ward',
  'district',
  'city',
  'order_total',
  'order_subtotal',
  'order_discount',
  'order_shipping',
  'coupon_code',
  'product_name',
  'variant_sku',
  'variant_name',
  'unit_price',
  'quantity',
  'line_subtotal',
] as const;

/**
 * Structural view of an order for export: the optional money-breakdown and
 * variant fields serialize as '' until (and unless) the owning restructures
 * populate them, so legacy rows stay aligned with the header.
 */
export type OrderExportRow = {
  orderNumber: string;
  status: string;
  createdAt: Date;
  totalAmount: string;
  subtotalAmount?: string | null;
  discountAmount?: string | null;
  shippingFee?: string | null;
  couponCode?: string | null;
  recipientName: string;
  phone: string;
  addressLine: string;
  ward?: string | null;
  district?: string | null;
  city: string;
  user?: { email: string } | null;
  items: Array<{
    productName: string;
    variantSku?: string | null;
    variantName?: string | null;
    unitPrice: string;
    quantity: number;
    subtotal: string;
  }>;
};

/** One CSV line per order item, with the order's fields repeated on each. */
export function orderCsvRows(order: OrderExportRow): string[] {
  const head: CsvValue[] = [
    order.orderNumber,
    order.status,
    order.createdAt,
    order.user?.email ?? '',
    order.recipientName,
    order.phone,
    order.addressLine,
    order.ward ?? '',
    order.district ?? '',
    order.city,
    order.totalAmount,
    order.subtotalAmount ?? '',
    order.discountAmount ?? '',
    order.shippingFee ?? '',
    order.couponCode ?? '',
  ];
  return order.items.map((item) =>
    csvLine([
      ...head,
      item.productName,
      item.variantSku ?? '',
      item.variantName ?? '',
      item.unitPrice,
      item.quantity,
      item.subtotal,
    ]),
  );
}

export const PRODUCT_EXPORT_COLUMNS = [
  'id',
  'name',
  'slug',
  'category',
  'price',
  'stock',
  'image_url',
  'created_at',
] as const;

export type ProductExportRow = {
  id: string;
  name: string;
  slug: string;
  price: string;
  stock: number;
  imageUrl?: string | null;
  createdAt: Date;
  category?: { name: string } | null;
};

export function productCsvRow(product: ProductExportRow): string {
  return csvLine([
    product.id,
    product.name,
    product.slug,
    product.category?.name ?? '',
    product.price,
    product.stock,
    product.imageUrl ?? '',
    product.createdAt,
  ]);
}

/** Dated so successive downloads never silently overwrite each other. */
export function exportFilename(prefix: string, date: Date): string {
  return `${prefix}-${date.toISOString().slice(0, 10)}.csv`;
}
