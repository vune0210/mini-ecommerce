import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  reportingRange,
  REPORTING_TIMEZONE,
} from '../stats/stats-calculations';
import { ListStockMovementsDto } from './dto/list-stock-movements.dto';
import { crossedIntoStock } from './stock-alert-rules';
import { StockAlertsService } from './stock-alerts.service';
import {
  StockMovement,
  StockMovementReason,
} from './entities/stock-movement.entity';

export type PaginatedStockMovements = {
  items: StockMovement[];
  total: number;
  page: number;
  limit: number;
};

export type StockMovementDraft = {
  productId: string | null;
  productName: string;
  delta: number;
  balanceAfter: number;
  reason: StockMovementReason;
  orderId?: string | null;
  actorUserId?: string | null;
  note?: string | null;
};

@Injectable()
export class StockMovementsService {
  constructor(
    @InjectRepository(StockMovement)
    private readonly movements: Repository<StockMovement>,
    private readonly stockAlerts: StockAlertsService,
  ) {}

  /**
   * Always takes the caller's EntityManager. The ledger entry has to commit or
   * roll back with the `products.stock` write it describes — a movement row
   * surviving a rolled-back checkout is worse than no ledger at all, because it
   * looks like authoritative evidence of a sale that never happened.
   *
   * A zero delta is skipped: an admin re-saving the same stock level should not
   * fill the ledger with rows that record nothing.
   */
  async record(
    manager: EntityManager,
    draft: StockMovementDraft,
  ): Promise<void> {
    if (draft.delta === 0) return;
    const repository = manager.getRepository(StockMovement);
    await repository.save(
      repository.create({
        productId: draft.productId,
        productName: draft.productName,
        delta: draft.delta,
        balanceAfter: draft.balanceAfter,
        reason: draft.reason,
        orderId: draft.orderId ?? null,
        actorUserId: draft.actorUserId ?? null,
        note: draft.note?.trim() || null,
      }),
    );
    // Every stock change in the system already funnels through here — a sale, a
    // cancellation, a received return, an admin correction. Detecting the
    // back-in-stock crossing at this one point is why no future path that moves
    // stock can forget to fire the alerts.
    if (draft.productId && crossedIntoStock(draft.delta, draft.balanceAfter))
      await this.stockAlerts.fireFor(
        manager,
        draft.productId,
        draft.productName,
      );
  }

  /** Convenience for several lines of one order, in the caller's transaction. */
  async recordMany(
    manager: EntityManager,
    drafts: StockMovementDraft[],
  ): Promise<void> {
    for (const draft of drafts) await this.record(manager, draft);
  }

  async findAll(
    query: ListStockMovementsDto,
  ): Promise<PaginatedStockMovements> {
    const range = reportingRange(query.from, query.to, REPORTING_TIMEZONE);
    if (!range.valid) throw new BadRequestException(range.error);

    const builder = this.movements
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.actorUser', 'actor');
    if (query.productId)
      builder.andWhere('movement.product_id = :productId', {
        productId: query.productId,
      });
    if (query.reason)
      builder.andWhere('movement.reason = :reason', { reason: query.reason });
    // Half-open bounds, same convention the stats and export ranges use.
    if (range.fromBound)
      builder.andWhere('movement.created_at >= :fromBound', {
        fromBound: range.fromBound,
      });
    if (range.toBound)
      builder.andWhere('movement.created_at < :toBound', {
        toBound: range.toBound,
      });

    const total = await builder.getCount();
    const items = await builder
      .orderBy('movement.createdAt', 'DESC')
      .addOrderBy('movement.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    return { items, total, page: query.page, limit: query.limit };
  }
}
