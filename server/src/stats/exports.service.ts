import {
  BadRequestException,
  Injectable,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Readable } from 'node:stream';
import { In, Repository } from 'typeorm';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { ExportOrdersDto } from './dto/export-orders.dto';
import {
  COUNTABLE_ORDER_STATUSES,
  CSV_BOM,
  csvLine,
  CUSTOMER_EXPORT_COLUMNS,
  customerCsvRow,
  exportFilename,
  ORDER_EXPORT_COLUMNS,
  orderCsvRows,
  PRODUCT_EXPORT_COLUMNS,
  productCsvRow,
  REPORTING_TIMEZONE,
  reportingRange,
  ResolvedRange,
} from './stats-calculations';

/** Rows stream out in keyset-paged batches — never a full-table load. */
export const EXPORT_BATCH_SIZE = 200;

@Injectable()
export class ExportsService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  orderExport(query: ExportOrdersDto): StreamableFile {
    // Validate before streaming: a throw here is still clean 400 JSON, while a
    // failure after the first chunk can only truncate the download.
    this.rangeFor(query);
    return this.download(this.orderCsv(query), 'orders');
  }

  productExport(): StreamableFile {
    return this.download(this.productCsv(), 'products');
  }

  customerExport(): StreamableFile {
    return this.download(this.customerCsv(), 'customers');
  }

  /**
   * batchSize is an injected default so tests can drive multiple batches with
   * tiny fixtures instead of hundreds of seeded orders.
   */
  async *orderCsv(
    query: ExportOrdersDto,
    batchSize = EXPORT_BATCH_SIZE,
  ): AsyncGenerator<string> {
    const range = this.rangeFor(query);
    // Header (with BOM for Excel) goes out before the first query, so an empty
    // window still downloads as a valid one-line CSV.
    yield CSV_BOM + csvLine(ORDER_EXPORT_COLUMNS);
    let cursor: string | null = null;
    for (;;) {
      const batch = await this.orderBatch(query, range, cursor, batchSize);
      for (const order of batch)
        for (const line of orderCsvRows(order)) yield line;
      if (batch.length < batchSize) return;
      cursor = batch[batch.length - 1].orderNumber;
    }
  }

  async *productCsv(batchSize = EXPORT_BATCH_SIZE): AsyncGenerator<string> {
    yield CSV_BOM + csvLine(PRODUCT_EXPORT_COLUMNS);
    let cursor: string | null = null;
    for (;;) {
      const builder = this.products
        .createQueryBuilder('product')
        // A many-to-one join is safe to page — no collection rows to truncate.
        .leftJoinAndSelect('product.category', 'category')
        .orderBy('product.slug', 'ASC')
        .take(batchSize);
      if (cursor !== null)
        builder.andWhere('product.slug > :cursor', { cursor });
      const batch = await builder.getMany();
      for (const product of batch) yield productCsvRow(product);
      if (batch.length < batchSize) return;
      cursor = batch[batch.length - 1].slug;
    }
  }

  /**
   * Customers with lifetime value attached. The order aggregate is a LEFT JOIN
   * over countable statuses only, so a customer who has only ever had a
   * cancelled order exports as 0 / 0.00 rather than being dropped from the
   * list — an export of "customers" that silently omits customers is a trap.
   */
  async *customerCsv(batchSize = EXPORT_BATCH_SIZE): AsyncGenerator<string> {
    yield CSV_BOM + csvLine(CUSTOMER_EXPORT_COLUMNS);
    let cursor: string | null = null;
    for (;;) {
      const builder = this.users
        .createQueryBuilder('user')
        .leftJoin(
          Order,
          'order',
          'order.user_id = user.id AND order.status IN (:...countable)',
          { countable: COUNTABLE_ORDER_STATUSES },
        )
        .select('user.id', 'id')
        .addSelect('user.name', 'name')
        .addSelect('user.email', 'email')
        .addSelect('user.is_active', 'isActive')
        .addSelect('user.created_at', 'createdAt')
        .addSelect('COUNT(order.id)', 'orders')
        .addSelect('COALESCE(SUM(order.total_amount), 0)', 'totalSpent')
        .where('user.role = :role', { role: UserRole.CUSTOMER })
        .groupBy('user.id')
        // Keyset page on the unique email, so no OFFSET scan and no risk of a
        // concurrent sign-up shifting rows between pages.
        .orderBy('user.email', 'ASC')
        .limit(batchSize);
      if (cursor !== null) builder.andWhere('user.email > :cursor', { cursor });
      const batch = await builder.getRawMany<{
        id: string;
        name: string;
        email: string;
        isActive: number | boolean;
        createdAt: Date;
        orders: string;
        totalSpent: string;
      }>();
      for (const row of batch)
        yield customerCsvRow({
          id: row.id,
          name: row.name,
          email: row.email,
          isActive: Boolean(row.isActive),
          createdAt: new Date(row.createdAt),
          orders: Number(row.orders),
          totalSpent: Number(row.totalSpent).toFixed(2),
        });
      if (batch.length < batchSize) return;
      cursor = batch[batch.length - 1].email;
    }
  }

  private rangeFor(query: ExportOrdersDto): ResolvedRange {
    const range = reportingRange(query.from, query.to, REPORTING_TIMEZONE);
    if (!range.valid) throw new BadRequestException(range.error);
    return range;
  }

  /** Keyset page on the unique order_number — no OFFSET scans over the table. */
  private async orderBatch(
    query: ExportOrdersDto,
    range: ResolvedRange,
    cursor: string | null,
    batchSize: number,
  ): Promise<Order[]> {
    const page = this.orders
      .createQueryBuilder('order')
      .select(['order.id', 'order.orderNumber'])
      .orderBy('order.orderNumber', 'ASC')
      .take(batchSize);
    if (cursor !== null)
      page.andWhere('order.orderNumber > :cursor', { cursor });
    if (query.status)
      page.andWhere('order.status = :status', { status: query.status });
    if (range.fromBound)
      page.andWhere('order.created_at >= :fromBound', {
        fromBound: range.fromBound,
      });
    if (range.toBound)
      page.andWhere('order.created_at < :toBound', { toBound: range.toBound });
    const ids = (await page.getMany()).map((order) => order.id);
    if (ids.length === 0) return [];
    // In() does not preserve order, so the reload re-applies ORDER BY
    // order_number — CSV data rows must ascend like the keyset pages do.
    return this.orders.find({
      where: { id: In(ids) },
      relations: { items: true, user: true },
      order: { orderNumber: 'ASC' },
    });
  }

  private download(
    rows: AsyncGenerator<string>,
    prefix: string,
  ): StreamableFile {
    const stream = Readable.from(rows);
    // A query failure mid-stream must truncate the download, never append
    // error text to the CSV. Pre-stream failures stay clean JSON because
    // AllExceptionsFilter already skips responses with headers sent.
    stream.once('error', () => stream.destroy());
    return new StreamableFile(stream, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${exportFilename(prefix, new Date())}"`,
    });
  }
}
