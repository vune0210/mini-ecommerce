import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  DeepPartial,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { StockMovementsService } from '../inventory/stock-movements.service';
import { OrderStatusHistory } from '../orders/entities/order-status-history.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { historyNote, sortForLocking } from '../orders/order-rules';
import { Product } from '../products/entities/product.entity';
import { UserRole } from '../users/entities/user.entity';
import { CancelReturnDto } from './dto/cancel-return.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { ListAdminReturnsDto, ListReturnsDto } from './dto/list-returns.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { ReturnRequestItem } from './entities/return-request-item.entity';
import { ReturnStatusHistory } from './entities/return-status-history.entity';
import { ReturnRequest, ReturnStatus } from './entities/return-request.entity';
import {
  buildReturnNumber,
  CLAIMING_RETURN_STATUSES,
  isTerminalReturnStatus,
  mergeReturnLines,
  refundTotal,
  RETURN_STOCK_MOVEMENT_REASON,
  RETURN_WINDOW_DAYS,
  ReturnableLine,
  returnEligibility,
  returnLineFailures,
  returnLineSubtotal,
  returnMovementNote,
  validReturnTransition,
  visibleReturnStatusEvent,
  VisibleReturnStatusEvent,
} from './return-rules';

export type PaginatedReturnRequests = {
  items: ReturnRequest[];
  total: number;
  page: number;
  limit: number;
};

const RETURN_NUMBER_ATTEMPTS = 5;

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ReturnRequest)
    private readonly requests: Repository<ReturnRequest>,
    @InjectRepository(ReturnStatusHistory)
    private readonly statusHistory: Repository<ReturnStatusHistory>,
    private readonly stockMovements: StockMovementsService,
  ) {}

  /**
   * Files a return against one of the caller's completed orders.
   *
   * Everything runs in one transaction behind a lock on the order row: the
   * "how much is left to return" answer is only true for as long as no other
   * request for the same order is being written, and two tabs submitting the
   * same form would otherwise each see the full quantity as available.
   */
  async create(
    user: AuthenticatedUser,
    dto: CreateReturnDto,
  ): Promise<ReturnRequest> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockOrder(manager, dto.orderId);
      const order = await manager.getRepository(Order).findOne({
        where: { id: dto.orderId },
        relations: { items: true, user: true },
      });
      if (!order) throw new NotFoundException('Order not found');
      // Ownership before eligibility: a stranger must not learn an order's
      // status from the shape of the rejection.
      if (order.user.id !== user.id)
        throw new ForbiddenException('You do not have access to this order');

      const eligibility = returnEligibility(
        order.status,
        await this.completionTime(manager, order),
        new Date(),
        RETURN_WINDOW_DAYS,
      );
      if (!eligibility.eligible)
        throw new BadRequestException(eligibility.reason);

      const lines = mergeReturnLines(dto.items);
      const claimed = await this.claimedByOrderItem(manager, order.id);
      const returnable: ReturnableLine[] = order.items.map((item) => ({
        orderItemId: item.id,
        purchased: item.quantity,
        claimed: claimed.get(item.id) ?? 0,
      }));
      const failures = returnLineFailures(lines, returnable);
      if (failures.length) {
        const payload = {
          message: 'One or more lines cannot be returned',
          items: failures,
        };
        // A line that is not on the order is a malformed request; a line that
        // is spoken for is a race with another request, which is a conflict.
        throw failures.some((failure) => failure.reason === 'not-in-order')
          ? new BadRequestException(payload)
          : new ConflictException(payload);
      }

      const orderItems = new Map(order.items.map((item) => [item.id, item]));
      const drafts = lines.map((line) => {
        const orderItem = orderItems.get(line.orderItemId)!;
        return {
          orderItemId: orderItem.id,
          // Name and price are snapshotted from the order line, which is
          // itself a snapshot of the sale — never from the live product.
          productName: orderItem.productName,
          unitPrice: Number(orderItem.unitPrice).toFixed(2),
          quantity: line.quantity,
          subtotal: returnLineSubtotal(orderItem.unitPrice, line.quantity),
        };
      });

      const request = await this.insertRequest(manager, {
        orderId: order.id,
        userId: user.id,
        status: ReturnStatus.REQUESTED,
        reason: dto.reason,
        note: historyNote(dto.note),
        refundAmount: refundTotal(drafts),
        resolvedAt: null,
      });
      const itemRepository = manager.getRepository(ReturnRequestItem);
      await itemRepository.save(
        drafts.map((draft) =>
          itemRepository.create({ ...draft, returnRequestId: request.id }),
        ),
      );
      // A null fromStatus marks the creation event in the audit trail.
      await this.recordTransition(
        manager,
        request,
        null,
        ReturnStatus.REQUESTED,
        user,
        dto.note,
      );
      return this.requestWithItems(manager, request.id);
    });
  }

  async findMine(
    userId: string,
    query: ListReturnsDto,
  ): Promise<PaginatedReturnRequests> {
    return this.paginate(query, (builder) =>
      builder.andWhere('request.user_id = :userId', { userId }),
    );
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<ReturnRequest> {
    const request = await this.requestWithItems(
      this.dataSource.manager,
      id,
      true,
    );
    this.assertVisible(request, user);
    return request;
  }

  async findAll(query: ListAdminReturnsDto): Promise<PaginatedReturnRequests> {
    return this.paginate(
      query,
      (builder) => {
        const search = query.search?.trim();
        if (search)
          builder.andWhere(
            '(request.requestNumber LIKE :search OR order.orderNumber LIKE :search OR user.name LIKE :search OR user.email LIKE :search)',
            { search: `%${search}%` },
          );
        return builder;
      },
      true,
    );
  }

  /**
   * Status-history timeline, oldest first. Owners get the actor redacted to
   * role + display name via visibleReturnStatusEvent; only admins see the id.
   */
  async history(
    id: string,
    user: AuthenticatedUser,
  ): Promise<VisibleReturnStatusEvent[]> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Return request not found');
    this.assertVisible(request, user);
    const events = await this.statusHistory.find({
      where: { returnRequestId: id },
      relations: { actorUser: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const viewerIsAdmin = user.role === UserRole.ADMIN;
    return events.map((event) =>
      visibleReturnStatusEvent(event, viewerIsAdmin),
    );
  }

  /** Withdrawal by the customer, allowed only while nobody has acted yet. */
  async cancel(
    id: string,
    user: AuthenticatedUser,
    dto: CancelReturnDto,
  ): Promise<ReturnRequest> {
    return this.dataSource.transaction(async (manager) => {
      const request = await this.lockRequest(manager, id);
      if (request.userId !== user.id)
        throw new ForbiddenException(
          'You do not have access to this return request',
        );
      if (request.status !== ReturnStatus.REQUESTED)
        throw new BadRequestException(
          'Only a return request that has not been actioned can be cancelled',
        );
      return this.applyTransition(
        manager,
        request,
        ReturnStatus.CANCELLED,
        user,
        dto.note,
      );
    });
  }

  /**
   * The admin lifecycle move. Locked first, then validated: two admins clicking
   * "Received" at the same moment must not both restock the goods.
   */
  async updateStatus(
    id: string,
    dto: UpdateReturnStatusDto,
    actor: AuthenticatedUser,
  ): Promise<ReturnRequest> {
    return this.dataSource.transaction(async (manager) => {
      const request = await this.lockRequest(manager, id);
      // CANCELLED is a legal edge in the transition map because the customer
      // owns it. Staff reject; only the customer withdraws.
      if (dto.status === ReturnStatus.CANCELLED)
        throw new BadRequestException(
          'Only the customer can cancel a return request; reject it instead',
        );
      if (!validReturnTransition(request.status, dto.status))
        throw new BadRequestException(
          `Invalid status transition from ${request.status} to ${dto.status}`,
        );
      return this.applyTransition(
        manager,
        request,
        dto.status,
        actor,
        dto.note,
      );
    });
  }

  /**
   * The one place a return's status changes. Side effects live here so that the
   * stock write, the ledger row, the status change and the audit event share
   * the caller's transaction and cannot half-commit.
   */
  private async applyTransition(
    manager: EntityManager,
    request: ReturnRequest,
    next: ReturnStatus,
    actor: AuthenticatedUser,
    note?: string | null,
  ): Promise<ReturnRequest> {
    if (!validReturnTransition(request.status, next))
      throw new BadRequestException(
        `Invalid status transition from ${request.status} to ${next}`,
      );
    if (next === ReturnStatus.RECEIVED)
      await this.restock(manager, request, actor);
    const fromStatus = request.status;
    request.status = next;
    // Stamped on the first terminal transition and never moved: it is the
    // moment the case closed, not the moment the row was last touched.
    if (isTerminalReturnStatus(next) && !request.resolvedAt)
      request.resolvedAt = new Date();
    await manager.getRepository(ReturnRequest).save(request);
    await this.recordTransition(
      manager,
      request,
      fromStatus,
      next,
      actor,
      note,
    );
    return this.requestWithItems(manager, request.id, true);
  }

  /**
   * Puts the goods back on the shelf, once, on the transition into RECEIVED —
   * the only moment the units are known to physically exist again. APPROVED is
   * a promise; REFUNDED is money. Neither may move stock.
   */
  private async restock(
    manager: EntityManager,
    request: ReturnRequest,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const items = await manager.getRepository(ReturnRequestItem).find({
      where: { returnRequestId: request.id },
      relations: { orderItem: true },
    });
    const lines = items.map((item) => ({
      productId: item.orderItem.productId,
      productName: item.productName,
      quantity: item.quantity,
      returnRequestItemId: item.id,
    }));
    // Same globally deterministic lock order as checkout and cancellation: a
    // return and a checkout touching the same two products in opposite order
    // would otherwise deadlock, and MySQL kills one with no retry above this.
    for (const line of sortForLocking(lines)) {
      if (!line.productId) {
        // order_items -> products is ON DELETE SET NULL, so the product this
        // line sold no longer exists and there is no row to credit. Recreating
        // it makes a new id, so the stock is genuinely unrecoverable — say so
        // rather than skipping in silence.
        this.logger.warn({
          message:
            'Received return line references a deleted product; stock not restored',
          returnRequestId: request.id,
          requestNumber: request.requestNumber,
          returnRequestItemId: line.returnRequestItemId,
          productName: line.productName,
          quantity: line.quantity,
        });
        continue;
      }
      const product = await manager.getRepository(Product).findOne({
        where: { id: line.productId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) continue;
      product.stock += line.quantity;
      await manager.getRepository(Product).save(product);
      await this.stockMovements.record(manager, {
        productId: product.id,
        productName: product.name,
        delta: line.quantity,
        balanceAfter: product.stock,
        reason: RETURN_STOCK_MOVEMENT_REASON,
        orderId: request.orderId,
        actorUserId: actor.id,
        note: returnMovementNote(request.requestNumber),
      });
    }
  }

  /**
   * Units of each order line already spoken for by requests that have not been
   * rejected or withdrawn. Summed in SQL rather than by loading every past
   * request, and scoped to the order so an unrelated return cannot block a line.
   */
  private async claimedByOrderItem(
    manager: EntityManager,
    orderId: string,
  ): Promise<Map<string, number>> {
    const rows = await manager
      .getRepository(ReturnRequestItem)
      .createQueryBuilder('item')
      .innerJoin('item.returnRequest', 'request')
      .select('item.order_item_id', 'orderItemId')
      .addSelect('SUM(item.quantity)', 'claimed')
      .where('request.order_id = :orderId', { orderId })
      .andWhere('request.status IN (:...statuses)', {
        statuses: CLAIMING_RETURN_STATUSES,
      })
      .groupBy('item.order_item_id')
      .getRawMany<{ orderItemId: string; claimed: string }>();
    return new Map(rows.map((row) => [row.orderItemId, Number(row.claimed)]));
  }

  /**
   * When the order became returnable. Read from the status history rather than
   * from a column on the order, because completion is an event and `updated_at`
   * moves for any write at all.
   *
   * Orders that predate the history table carry a backfilled creation marker
   * whose timestamp is the order's own creation time; those windows are
   * therefore measured from purchase. Deliberately the conservative direction —
   * better a slightly short window than a completion moment we invented.
   */
  private async completionTime(
    manager: EntityManager,
    order: Order,
  ): Promise<Date> {
    const event = await manager.getRepository(OrderStatusHistory).findOne({
      where: { orderId: order.id, toStatus: OrderStatus.COMPLETED },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return event?.createdAt ?? order.updatedAt;
  }

  private assertVisible(request: ReturnRequest, user: AuthenticatedUser): void {
    if (user.role !== UserRole.ADMIN && request.userId !== user.id)
      throw new ForbiddenException(
        'You do not have access to this return request',
      );
  }

  private async paginate(
    query: ListReturnsDto,
    refine: (
      builder: SelectQueryBuilder<ReturnRequest>,
    ) => SelectQueryBuilder<ReturnRequest> | void,
    includeUser = false,
  ): Promise<PaginatedReturnRequests> {
    const builder = this.requests.createQueryBuilder('request');
    // The admin search spans the order and the customer, so both are joined
    // before `refine` gets a chance to reference them.
    if (includeUser)
      builder
        .leftJoinAndSelect('request.user', 'user')
        .leftJoinAndSelect('request.order', 'order');
    if (query.status)
      builder.andWhere('request.status = :status', { status: query.status });
    refine(builder);
    const total = await builder.getCount();
    // Ids first, then a second load for relations: a paged join on a one-to-many
    // would otherwise truncate a request's items. The id tiebreak keeps pages
    // stable.
    const page = await builder
      .orderBy('request.createdAt', 'DESC')
      .addOrderBy('request.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    const items = page.length
      ? await this.requests.find({
          where: { id: In(page.map((request) => request.id)) },
          relations: {
            items: true,
            order: true,
            ...(includeUser ? { user: true } : {}),
          },
          order: { createdAt: 'DESC', id: 'ASC' },
        })
      : [];
    return { items, total, page: query.page, limit: query.limit };
  }

  /**
   * Appends one audit row per transition, inside the caller's transaction so
   * the history commits (or rolls back) atomically with the status change it
   * records. The actor's role is snapshotted so the row stays meaningful if the
   * account is later deleted (actor_user_id is ON DELETE SET NULL).
   */
  private async recordTransition(
    manager: EntityManager,
    request: ReturnRequest,
    fromStatus: ReturnStatus | null,
    toStatus: ReturnStatus,
    actor: AuthenticatedUser,
    note?: string | null,
  ): Promise<void> {
    const repository = manager.getRepository(ReturnStatusHistory);
    await repository.save(
      repository.create({
        returnRequestId: request.id,
        fromStatus,
        toStatus,
        actorUserId: actor.id,
        actorRole: actor.role,
        note: historyNote(note),
      }),
    );
  }

  /**
   * Takes a row lock before the returnable quantities are read. Without it two
   * concurrent requests both see the full quantity free and the customer
   * returns more than they bought. Kept join-free so MySQL locks only the
   * orders row.
   */
  private async lockOrder(manager: EntityManager, id: string): Promise<void> {
    const locked = await manager
      .getRepository(Order)
      .createQueryBuilder('order')
      .setLock('pessimistic_write')
      .where('order.id = :id', { id })
      .getOne();
    if (!locked) throw new NotFoundException('Order not found');
  }

  /** Same reasoning as lockOrder, for the request whose status is about to move. */
  private async lockRequest(
    manager: EntityManager,
    id: string,
  ): Promise<ReturnRequest> {
    const locked = await manager
      .getRepository(ReturnRequest)
      .createQueryBuilder('request')
      .setLock('pessimistic_write')
      .where('request.id = :id', { id })
      .getOne();
    if (!locked) throw new NotFoundException('Return request not found');
    return locked;
  }

  /**
   * Allocates the request number by inserting and retrying, not by probing
   * first. A SELECT-then-INSERT lets two concurrent filings pick the same
   * candidate; the loser hits UQ_return_requests_request_number as a raw
   * QueryFailedError, which means a 500 and a rollback.
   *
   * A duplicate-key failure does not poison a MySQL transaction, so retrying
   * inside the same transaction is safe. `return_requests` has exactly one
   * unique index besides the primary key, so ER_DUP_ENTRY here can only be the
   * request number.
   */
  private async insertRequest(
    manager: EntityManager,
    draft: DeepPartial<ReturnRequest>,
  ): Promise<ReturnRequest> {
    const repository = manager.getRepository(ReturnRequest);
    for (let attempt = 1; attempt <= RETURN_NUMBER_ATTEMPTS; attempt += 1) {
      try {
        return await repository.save(
          repository.create({
            ...draft,
            requestNumber: buildReturnNumber(new Date()),
          }),
        );
      } catch (error) {
        const duplicate =
          error instanceof QueryFailedError &&
          (error as QueryFailedError & { code?: string }).code ===
            'ER_DUP_ENTRY';
        if (!duplicate) throw error;
        if (attempt === RETURN_NUMBER_ATTEMPTS)
          throw new ConflictException(
            'Could not allocate a unique return number',
          );
      }
    }
    throw new ConflictException('Could not allocate a unique return number');
  }

  private async requestWithItems(
    manager: EntityManager,
    id: string,
    includeUser = false,
  ): Promise<ReturnRequest> {
    const request = await manager.getRepository(ReturnRequest).findOne({
      where: { id },
      relations: {
        items: true,
        order: true,
        ...(includeUser ? { user: true } : {}),
      },
    });
    if (!request) throw new NotFoundException('Return request not found');
    return request;
  }
}
