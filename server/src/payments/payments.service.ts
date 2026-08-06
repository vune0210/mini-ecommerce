import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { OrderStatusHistory } from '../orders/entities/order-status-history.entity';
import { OrderStatus, PaymentMethod } from '../orders/entities/order.entity';
import { StripePaymentAdapter } from './stripe-payment.adapter';
import { Order } from '../orders/entities/order.entity';
import { PaymentRefund, RefundStatus } from './entities/payment-refund.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import {
  PaymentWebhookEvent,
  WebhookEventStatus,
} from './entities/payment-webhook-event.entity';
import {
  paymentStatusAfterRefund,
  refundableAmount,
  webhookPayloadHash,
} from './payment-rules';

/** Provider-neutral payment ledger. No gateway credentials live in this layer. */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(PaymentWebhookEvent)
    private readonly webhookEvents: Repository<PaymentWebhookEvent>,
    private readonly stripe: StripePaymentAdapter,
  ) {}

  async createForOrder(manager: EntityManager, order: Order): Promise<Payment> {
    const repository = manager.getRepository(Payment);
    return repository.save(
      repository.create({
        orderId: order.id,
        provider: order.paymentMethod === PaymentMethod.STRIPE ? 'STRIPE' : 'MANUAL',
        externalPaymentId: null,
        status: PaymentStatus.PENDING,
        amount: order.totalAmount,
        refundedAmount: '0.00',
        currency: 'VND',
        failureCode: null,
        failureMessage: null,
        metadata: { paymentMethod: order.paymentMethod },
      }),
    );
  }

  async createStripeSession(orderId: string, user: AuthenticatedUser): Promise<{ redirectUrl: string }> {
    const order = await this.dataSource.getRepository(Order).findOne({ where: { id: orderId }, relations: { user: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.user.id !== user.id) throw new ForbiddenException('You do not have access to this order');
    if (order.paymentMethod !== PaymentMethod.STRIPE || order.status !== OrderStatus.PENDING) throw new BadRequestException('Order is not awaiting Stripe payment');
    const payment = await this.payments.findOne({ where: { orderId }, order: { createdAt: 'DESC' } });
    if (!payment) throw new NotFoundException('Payment not found');
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const result = await this.stripe.createPayment({ paymentId: payment.id, orderId: order.id, orderNumber: order.orderNumber, amount: order.totalAmount, currency: payment.currency, returnUrl: `${frontend}/orders/${order.id}` });
    payment.provider = 'STRIPE'; payment.externalPaymentId = result.externalPaymentId; payment.metadata = { ...(payment.metadata ?? {}), ...(result.metadata ?? {}) };
    await this.payments.save(payment);
    if (!result.redirectUrl) throw new BadRequestException('Stripe did not return a checkout URL');
    return { redirectUrl: result.redirectUrl };
  }

  async processStripeWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<{ received: true; duplicate?: true }> {
    const verified = this.stripe.verifyWebhook(rawBody, headers);
    const claim = await this.claimWebhook('STRIPE', verified.eventId, rawBody);
    if (!claim) return { received: true, duplicate: true };
    try {
      await this.dataSource.transaction(async (manager) => {
        const payment = await manager.getRepository(Payment).findOne({ where: { provider: 'STRIPE', externalPaymentId: verified.externalPaymentId }, lock: { mode: 'pessimistic_write' } });
        if (!payment) throw new NotFoundException('Stripe payment not found');
        if (verified.type === 'PAYMENT_SUCCEEDED') {
          if (verified.amount !== undefined && Number(verified.amount) !== Number(payment.amount)) throw new BadRequestException('Stripe amount mismatch');
          payment.status = PaymentStatus.SUCCEEDED;
          const order = await manager.getRepository(Order).findOne({ where: { id: payment.orderId }, lock: { mode: 'pessimistic_write' } });
          if (!order) throw new NotFoundException('Order not found');
          if (order.status === OrderStatus.PENDING) {
            order.status = OrderStatus.PAID; order.paidAt ??= new Date();
            await manager.getRepository(Order).save(order);
            await manager.getRepository(OrderStatusHistory).save(manager.getRepository(OrderStatusHistory).create({ orderId: order.id, fromStatus: OrderStatus.PENDING, toStatus: OrderStatus.PAID, actorUserId: null, actorRole: null, note: 'Stripe webhook confirmed payment' }));
          }
        } else if (verified.type === 'PAYMENT_FAILED') payment.status = PaymentStatus.FAILED;
        await manager.getRepository(Payment).save(payment);
      });
      await this.finishWebhook(claim);
      return { received: true };
    } catch (error) {
      await this.finishWebhook(claim, error instanceof Error ? error.name.slice(0, 64) : 'UNKNOWN');
      throw error;
    }
  }

  /** Runs after the order transaction commits, so a slow provider never holds DB locks. */
  async processPendingRefundForOrder(orderId: string): Promise<void> {
    const refund = await this.dataSource.getRepository(PaymentRefund).findOne({
      where: { payment: { orderId }, status: RefundStatus.PENDING },
      relations: { payment: true },
      order: { createdAt: 'ASC' },
    });
    if (!refund || refund.provider !== 'STRIPE' || !refund.payment.externalPaymentId) return;
    try {
      const result = await this.stripe.refund({
        paymentId: refund.paymentId,
        externalPaymentId: refund.payment.externalPaymentId,
        refundId: refund.id,
        amount: refund.amount,
        reason: refund.reason,
        idempotencyKey: refund.idempotencyKey,
      });
      await this.dataSource.transaction(async (manager) => {
        const current = await manager.getRepository(PaymentRefund).findOne({ where: { id: refund.id }, lock: { mode: 'pessimistic_write' } });
        const payment = await manager.getRepository(Payment).findOne({ where: { id: refund.paymentId }, lock: { mode: 'pessimistic_write' } });
        if (!current || !payment || current.status !== RefundStatus.PENDING) return;
        current.externalRefundId = result.externalRefundId;
        current.status = result.status === 'SUCCEEDED' ? RefundStatus.SUCCEEDED : RefundStatus.PENDING;
        if (current.status === RefundStatus.SUCCEEDED) {
          payment.refundedAmount = (Number(payment.refundedAmount) + Number(current.amount)).toFixed(2);
          payment.status = paymentStatusAfterRefund(payment.amount, payment.refundedAmount, false);
        }
        await manager.getRepository(PaymentRefund).save(current);
        await manager.getRepository(Payment).save(payment);
      });
    } catch (error) {
      this.logger.error({ message: 'Stripe refund attempt failed; request remains pending for retry', orderId, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  async markPaid(manager: EntityManager, orderId: string): Promise<void> {
    const payment = await this.latestForOrder(manager, orderId);
    if (!payment || payment.status === PaymentStatus.SUCCEEDED) return;
    payment.status = PaymentStatus.SUCCEEDED;
    payment.failureCode = null;
    payment.failureMessage = null;
    await manager.getRepository(Payment).save(payment);
  }

  /**
   * Cancels an uncollected payment, or creates an idempotent full-refund job
   * when money was already captured. Calling a remote gateway is deliberately
   * left to an adapter after commit; network I/O inside the order transaction
   * could charge successfully and then roll back the local record.
   */
  async cancelOrQueueRefund(
    manager: EntityManager,
    order: Order,
    requestedBy: string,
  ): Promise<void> {
    const payment = await this.latestForOrder(manager, order.id);
    if (!payment) return;
    if (
      payment.status === PaymentStatus.PENDING ||
      payment.status === PaymentStatus.AUTHORIZED
    ) {
      payment.status = PaymentStatus.CANCELLED;
      await manager.getRepository(Payment).save(payment);
      return;
    }
    if (payment.status !== PaymentStatus.SUCCEEDED) return;

    const amount = refundableAmount(payment);
    if (Number(amount) <= 0) return;
    const refundRepository = manager.getRepository(PaymentRefund);
    const key = `order-cancel:${order.id}`;
    const existing = await refundRepository.findOneBy({
      paymentId: payment.id,
      idempotencyKey: key,
    });
    if (!existing)
      await refundRepository.save(
        refundRepository.create({
          paymentId: payment.id,
          provider: payment.provider,
          externalRefundId: null,
          idempotencyKey: key,
          status: RefundStatus.PENDING,
          amount,
          reason: 'Order cancelled after payment',
          requestedBy,
        }),
      );
    payment.status = paymentStatusAfterRefund(
      payment.amount,
      payment.refundedAmount,
      true,
    );
    await manager.getRepository(Payment).save(payment);
  }

  /** Atomic INSERT claim: duplicate webhook delivery returns null. */
  async claimWebhook(
    provider: string,
    externalEventId: string,
    rawBody: Buffer,
  ): Promise<PaymentWebhookEvent | null> {
    try {
      return await this.webhookEvents.save(
        this.webhookEvents.create({
          provider: provider.toUpperCase(),
          externalEventId,
          payloadHash: webhookPayloadHash(rawBody),
          status: WebhookEventStatus.PROCESSING,
          errorCode: null,
          processedAt: null,
        }),
      );
    } catch (error) {
      const duplicate =
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === 'ER_DUP_ENTRY';
      if (!duplicate) throw error;
      this.logger.log({
        message: 'Duplicate payment webhook ignored',
        provider,
        externalEventId,
      });
      return null;
    }
  }

  async finishWebhook(
    event: PaymentWebhookEvent,
    errorCode?: string,
  ): Promise<void> {
    event.status = errorCode
      ? WebhookEventStatus.FAILED
      : WebhookEventStatus.PROCESSED;
    event.errorCode = errorCode ?? null;
    event.processedAt = new Date();
    await this.webhookEvents.save(event);
  }

  private latestForOrder(
    manager: EntityManager,
    orderId: string,
  ): Promise<Payment | null> {
    return manager.getRepository(Payment).findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
  }
}
