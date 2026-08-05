import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { shippingSnapshot, ShippingSnapshot } from '../addresses/address-rules';
import { Address } from '../addresses/entities/address.entity';
import { AuthenticatedUser } from '../auth/auth.types';
import { CartItem } from '../cart/entities/cart-item.entity';
import { Cart } from '../cart/entities/cart.entity';
import { CouponsService } from '../coupons/coupons.service';
import { StockMovementReason } from '../inventory/entities/stock-movement.entity';
import { StockMovementsService } from '../inventory/stock-movements.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Product } from '../products/entities/product.entity';
import { UserRole } from '../users/entities/user.entity';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { ListAdminOrdersDto, ListOrdersDto } from './dto/list-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { Order, OrderStatus } from './entities/order.entity';
import {
  buildOrderNumber,
  DEFAULT_SHIPPING_POLICY,
  historyNote,
  orderGrandTotal,
  orderStatusNotice,
  sortForLocking,
  orderTotal,
  ShippingPolicy,
  shippingFeeFor,
  StockCheckItem,
  stockFailures,
  validOrderTransition,
  visibleStatusEvent,
  VisibleStatusEvent,
} from './order-rules';

export type PaginatedOrders = {
  items: Order[];
  total: number;
  page: number;
  limit: number;
};

const ORDER_NUMBER_ATTEMPTS = 5;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  private readonly shippingPolicy: ShippingPolicy;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderStatusHistory)
    private readonly statusHistory: Repository<OrderStatusHistory>,
    private readonly coupons: CouponsService,
    private readonly stockMovements: StockMovementsService,
    private readonly notifications: NotificationsService,
    configService: ConfigService,
  ) {
    // Read once at construction: a fee that changed between two lines of the
    // same checkout would break `total = subtotal - discount + shipping`.
    this.shippingPolicy = {
      flatFee:
        configService.get<string>('SHIPPING_FLAT_FEE') ??
        DEFAULT_SHIPPING_POLICY.flatFee,
      freeThreshold:
        configService.get<string>('FREE_SHIPPING_THRESHOLD') ??
        DEFAULT_SHIPPING_POLICY.freeThreshold,
    };
  }

  async checkout(user: AuthenticatedUser, dto: CheckoutDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await manager.getRepository(Cart).findOne({
        where: { user: { id: user.id } },
        relations: { items: { product: true } },
      });
      if (!cart?.items.length) throw new BadRequestException('Cart is empty');
      const products = new Map<string, Product>();
      const stockChecks: StockCheckItem[] = [];
      // Row locks are taken in a globally deterministic order. Locking in cart
      // order lets two carts holding the same two products in opposite order
      // deadlock, and MySQL kills one with no retry wrapper above this.
      for (const item of sortForLocking(cart.items)) {
        const product = await manager.getRepository(Product).findOne({
          where: { id: item.productId },
          lock: { mode: 'pessimistic_write' },
        });
        // A product can be unpublished or deleted while it sits in a cart, so
        // availability is re-checked here and not only at add-to-cart time.
        if (!product || !product.isActive || item.quantity > product.stock)
          stockChecks.push({
            productId: item.productId,
            productName: item.product.name,
            quantity: item.quantity,
            available: product?.stock ?? 0,
            unavailable: !product || !product.isActive,
          });
        else products.set(product.id, product);
      }
      const failed = stockFailures(stockChecks);
      if (failed.length)
        throw new ConflictException({
          message: 'Insufficient stock for one or more items',
          items: failed,
        });
      const subtotalAmount = orderTotal(
        cart.items.map((item) => ({
          price: products.get(item.productId)!.price,
          quantity: item.quantity,
        })),
      );
      // Spent inside this transaction, so a coupon consumed by an order that
      // then fails its stock check rolls back with it. `preview` reserves
      // nothing, which is why the code is re-validated here rather than trusted.
      const redeemed = dto.couponCode
        ? await this.coupons.redeem(
            manager,
            user.id,
            dto.couponCode,
            subtotalAmount,
          )
        : null;
      const discountAmount = redeemed?.discount ?? '0.00';
      const shippingFee = shippingFeeFor(
        Number(subtotalAmount) - Number(discountAmount),
        this.shippingPolicy,
      );
      const shipping = await this.resolveShipping(manager, user.id, dto);
      const order = await this.insertOrder(manager, {
        user: { id: user.id },
        status: OrderStatus.PENDING,
        subtotalAmount,
        discountAmount,
        shippingFee,
        totalAmount: orderGrandTotal(
          subtotalAmount,
          discountAmount,
          shippingFee,
        ),
        couponId: redeemed?.couponId ?? null,
        couponCode: redeemed?.code ?? null,
        paymentMethod: dto.paymentMethod,
        ...shipping,
        note: dto.note?.trim() || null,
      });
      if (redeemed)
        await this.coupons.recordRedemption(manager, {
          couponId: redeemed.couponId,
          userId: user.id,
          orderId: order.id,
          discountAmount: redeemed.discount,
        });
      // A null fromStatus marks the creation event in the audit trail.
      await this.recordTransition(
        manager,
        order,
        null,
        OrderStatus.PENDING,
        user,
      );
      const orderItems = cart.items.map((item) => {
        const product = products.get(item.productId)!;
        return manager.getRepository(OrderItem).create({
          order,
          orderId: order.id,
          product,
          productId: product.id,
          productName: product.name,
          unitPrice: Number(product.price).toFixed(2),
          quantity: item.quantity,
          subtotal: (Number(product.price) * item.quantity).toFixed(2),
        });
      });
      await manager.getRepository(OrderItem).save(orderItems);
      for (const item of cart.items) {
        const product = products.get(item.productId)!;
        product.stock -= item.quantity;
        await manager.getRepository(Product).save(product);
        await this.stockMovements.record(manager, {
          productId: product.id,
          productName: product.name,
          delta: -item.quantity,
          balanceAfter: product.stock,
          reason: StockMovementReason.SALE,
          orderId: order.id,
          actorUserId: user.id,
        });
      }
      await manager.getRepository(CartItem).delete({ cartId: cart.id });
      // Emitted inside the transaction: a receipt for an order that rolled back
      // sends the customer looking for it in an empty order list.
      await this.notifications.notify(manager, {
        userId: user.id,
        type: NotificationType.ORDER_PLACED,
        title: `Đã đặt đơn ${order.orderNumber}`,
        body: `Tổng tiền ${order.totalAmount}. Chúng tôi sẽ báo bạn khi trạng thái thay đổi.`,
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
      });
      return this.orderWithItems(manager, order.id);
    });
  }

  async findMine(
    userId: string,
    query: ListOrdersDto,
  ): Promise<PaginatedOrders> {
    return this.paginate(query, (builder) =>
      builder.andWhere('order.user_id = :userId', { userId }),
    );
  }
  async findOne(id: string, user: AuthenticatedUser): Promise<Order> {
    const order = await this.orderWithItems(this.dataSource.manager, id, true);
    if (user.role !== UserRole.ADMIN && order.user.id !== user.id)
      throw new ForbiddenException('You do not have access to this order');
    return order;
  }
  async findAll(query: ListAdminOrdersDto): Promise<PaginatedOrders> {
    return this.paginate(
      query,
      (builder) => {
        const search = query.search?.trim();
        if (search)
          builder.andWhere(
            '(order.orderNumber LIKE :search OR user.name LIKE :search OR user.email LIKE :search)',
            { search: `%${search}%` },
          );
        return builder;
      },
      true,
    );
  }

  private async paginate(
    query: ListOrdersDto,
    refine: (
      builder: SelectQueryBuilder<Order>,
    ) => SelectQueryBuilder<Order> | void,
    includeUser = false,
  ): Promise<PaginatedOrders> {
    const builder = this.orders.createQueryBuilder('order');
    if (includeUser) builder.leftJoinAndSelect('order.user', 'user');
    if (query.status)
      builder.andWhere('order.status = :status', { status: query.status });
    refine(builder);
    const total = await builder.getCount();
    // Ids first, then a second load for relations: a paged join on a one-to-many
    // would otherwise truncate an order's items. The id tiebreak keeps pages stable.
    const page = await builder
      .orderBy('order.createdAt', 'DESC')
      .addOrderBy('order.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    const items = page.length
      ? await this.orders.find({
          where: { id: In(page.map((order) => order.id)) },
          relations: {
            items: { product: true },
            ...(includeUser ? { user: true } : {}),
          },
          order: { createdAt: 'DESC', id: 'ASC' },
        })
      : [];
    return { items, total, page: query.page, limit: query.limit };
  }

  async cancel(
    id: string,
    user: AuthenticatedUser,
    dto: CancelOrderDto,
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockOrder(manager, id);
      const order = await this.orderWithItems(manager, id, true);
      if (order.user.id !== user.id)
        throw new ForbiddenException('You do not have access to this order');
      if (order.status !== OrderStatus.PENDING)
        throw new BadRequestException('Only pending orders can be cancelled');
      return this.cancelOrder(manager, order, user, dto.note);
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    actor: AuthenticatedUser,
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockOrder(manager, id);
      const order = await this.orderWithItems(manager, id, true);
      if (!validOrderTransition(order.status, dto.status))
        throw new BadRequestException(
          `Invalid status transition from ${order.status} to ${dto.status}`,
        );
      if (dto.status === OrderStatus.CANCELLED)
        return this.cancelOrder(manager, order, actor, dto.note);
      const fromStatus = order.status;
      order.status = dto.status;
      // Stamped once, on the first transition into PAID. A later SHIPPED or
      // COMPLETED must not move the payment timestamp forward — it is the
      // moment money arrived, not the moment the order last changed.
      if (dto.status === OrderStatus.PAID && !order.paidAt)
        order.paidAt = new Date();
      await manager.getRepository(Order).save(order);
      await this.recordTransition(
        manager,
        order,
        fromStatus,
        dto.status,
        actor,
        dto.note,
      );
      await this.notifyStatusChange(
        manager,
        order,
        fromStatus,
        dto.status,
        actor,
      );
      return this.orderWithItems(manager, order.id, true);
    });
  }

  /**
   * Status-history timeline, oldest first. Owners get the actor redacted to
   * role + display name via visibleStatusEvent; only admins see the actor id.
   */
  async history(
    id: string,
    user: AuthenticatedUser,
  ): Promise<VisibleStatusEvent[]> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (user.role !== UserRole.ADMIN && order.user.id !== user.id)
      throw new ForbiddenException('You do not have access to this order');
    const events = await this.statusHistory.find({
      where: { orderId: id },
      relations: { actorUser: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const viewerIsAdmin = user.role === UserRole.ADMIN;
    return events.map((event) => visibleStatusEvent(event, viewerIsAdmin));
  }

  /**
   * Resolves the destination the order ships to and freezes it onto the order.
   * A saved address is copied, never referenced: editing the address book
   * afterwards must not rewrite where a past parcel went.
   *
   * The inline fields are non-null by the time they get here — `@ValidateIf`
   * requires them whenever `addressId` is absent — but they are re-checked
   * because a shipping label built from `undefined` is not a failure anyone
   * should discover in the warehouse.
   */
  private async resolveShipping(
    manager: EntityManager,
    userId: string,
    dto: CheckoutDto,
  ): Promise<ShippingSnapshot> {
    if (dto.addressId) {
      const address = await manager
        .getRepository(Address)
        .findOneBy({ id: dto.addressId, userId });
      if (!address) throw new BadRequestException('Shipping address not found');
      return shippingSnapshot(address);
    }
    if (!dto.recipientName || !dto.phone || !dto.addressLine || !dto.city)
      throw new BadRequestException(
        'Provide addressId or the full shipping details',
      );
    return shippingSnapshot({
      recipientName: dto.recipientName,
      phone: dto.phone,
      addressLine: dto.addressLine,
      ward: dto.ward,
      district: dto.district,
      city: dto.city,
    });
  }

  private async cancelOrder(
    manager: EntityManager,
    order: Order,
    actor: AuthenticatedUser,
    note?: string | null,
  ): Promise<Order> {
    // Same deterministic lock order as checkout — a cancel and a checkout
    // touching the same two products would otherwise deadlock each other.
    for (const item of sortForLocking(order.items)) {
      if (!item.productId) {
        // order_items -> products is ON DELETE SET NULL, so the product this
        // line sold no longer exists and there is no row to credit. Recreating
        // it makes a new id, so the stock is genuinely unrecoverable — say so
        // rather than skipping in silence.
        this.logger.warn({
          message:
            'Cancelled order line references a deleted product; stock not restored',
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderItemId: item.id,
          productName: item.productName,
          quantity: item.quantity,
        });
        continue;
      }
      const product = await manager.getRepository(Product).findOne({
        where: { id: item.productId },
        lock: { mode: 'pessimistic_write' },
      });
      if (product) {
        product.stock += item.quantity;
        await manager.getRepository(Product).save(product);
        await this.stockMovements.record(manager, {
          productId: product.id,
          productName: product.name,
          delta: item.quantity,
          balanceAfter: product.stock,
          reason: StockMovementReason.CANCELLATION,
          orderId: order.id,
          actorUserId: actor.id,
        });
      }
    }
    // The discount budget goes back with the stock. Without this a cancelled
    // order permanently consumes one redemption of a limited coupon.
    await this.coupons.release(manager, order.id);
    const fromStatus = order.status;
    order.status = OrderStatus.CANCELLED;
    await manager.getRepository(Order).save(order);
    await this.recordTransition(
      manager,
      order,
      fromStatus,
      OrderStatus.CANCELLED,
      actor,
      note,
    );
    await this.notifyStatusChange(
      manager,
      order,
      fromStatus,
      OrderStatus.CANCELLED,
      actor,
    );
    return this.orderWithItems(manager, order.id, true);
  }

  /**
   * Tells the order's owner that someone else moved their order. Silent when
   * the actor is the owner — an inbox full of "you did the thing you just did"
   * is what teaches people to stop reading it.
   */
  private async notifyStatusChange(
    manager: EntityManager,
    order: Order,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const ownerId = order.user?.id;
    if (!ownerId) return;
    const notice = orderStatusNotice(fromStatus, toStatus, actor.id, ownerId);
    if (!notice) return;
    await this.notifications.notify(manager, {
      userId: ownerId,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: `${notice.title} · ${order.orderNumber}`,
      body: notice.body,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: toStatus,
      },
    });
  }

  /**
   * Appends one audit row per transition, inside the caller's transaction so
   * the history commits (or rolls back) atomically with the status change it
   * records. The actor's role is snapshotted so the row stays meaningful if
   * the account is later deleted (actor_user_id is ON DELETE SET NULL).
   */
  private async recordTransition(
    manager: EntityManager,
    order: Order,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    actor: AuthenticatedUser,
    note?: string | null,
  ): Promise<void> {
    const repository = manager.getRepository(OrderStatusHistory);
    await repository.save(
      repository.create({
        orderId: order.id,
        fromStatus,
        toStatus,
        actorUserId: actor.id,
        actorRole: actor.role,
        note: historyNote(note),
      }),
    );
  }

  /**
   * Takes a row lock before a status transition is decided. Without it two
   * concurrent cancels both read PENDING and each restocks the same items.
   * Kept join-free so MySQL locks only the orders row.
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

  /**
   * Allocates the order number by inserting and retrying, not by probing first.
   * A SELECT-then-INSERT let two concurrent checkouts pick the same candidate;
   * the loser hit UQ_orders_order_number as a raw QueryFailedError, which meant
   * a 500 and a rollback of the stock decrements that had already succeeded.
   *
   * A duplicate-key failure does not poison a MySQL transaction, so retrying
   * inside the same transaction is safe. `orders` has exactly one unique index
   * besides the primary key, so ER_DUP_ENTRY here can only be the order number.
   */
  private async insertOrder(
    manager: EntityManager,
    draft: DeepPartial<Order>,
  ): Promise<Order> {
    const repository = manager.getRepository(Order);
    for (let attempt = 1; attempt <= ORDER_NUMBER_ATTEMPTS; attempt += 1) {
      try {
        return await repository.save(
          repository.create({
            ...draft,
            orderNumber: buildOrderNumber(new Date()),
          }),
        );
      } catch (error) {
        const duplicate =
          error instanceof QueryFailedError &&
          (error as QueryFailedError & { code?: string }).code ===
            'ER_DUP_ENTRY';
        if (!duplicate) throw error;
        if (attempt === ORDER_NUMBER_ATTEMPTS)
          throw new ConflictException(
            'Could not allocate a unique order number',
          );
      }
    }
    throw new ConflictException('Could not allocate a unique order number');
  }

  private async orderWithItems(
    manager: EntityManager,
    id: string,
    includeUser = false,
  ): Promise<Order> {
    const order = await manager.getRepository(Order).findOne({
      where: { id },
      relations: {
        items: { product: true },
        ...(includeUser ? { user: true } : {}),
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
}
