import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { CreatePaymentInput, CreatePaymentResult, PaymentProviderAdapter, RefundPaymentInput, RefundPaymentResult, VerifiedPaymentWebhook } from './payment-provider';

type StripeObject = { id: string; payment_intent?: string | null; payment_status?: string; status?: string; amount_total?: number; metadata?: Record<string, string> };
type StripeEvent = { id: string; type: string; data: { object: StripeObject } };

@Injectable()
export class StripePaymentAdapter implements PaymentProviderAdapter {
  readonly name = 'STRIPE';
  private readonly secret: string;
  private readonly webhookSecret: string;
  constructor(config: ConfigService) {
    this.secret = config.get<string>('STRIPE_SECRET_KEY') ?? '';
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
  }

  isConfigured(): boolean { return Boolean(this.secret && this.webhookSecret); }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    this.assertConfigured();
    const form = new URLSearchParams({
      mode: 'payment',
      success_url: input.returnUrl,
      cancel_url: input.returnUrl,
      client_reference_id: input.orderId,
      'metadata[orderId]': input.orderId,
      'metadata[paymentId]': input.paymentId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': input.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(Math.round(Number(input.amount))),
      'line_items[0][price_data][product_data][name]': `MiniShop ${input.orderNumber}`,
    });
    const session = await this.request<StripeObject>('/v1/checkout/sessions', form, `checkout:${input.paymentId}`);
    return { externalPaymentId: session.id, redirectUrl: (session as StripeObject & { url?: string }).url, metadata: { sessionId: session.id } };
  }

  async refund(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    this.assertConfigured();
    let paymentIntent = input.externalPaymentId;
    if (paymentIntent.startsWith('cs_')) {
      const session = await this.get<StripeObject>(`/v1/checkout/sessions/${encodeURIComponent(paymentIntent)}`);
      if (!session.payment_intent) throw new BadGatewayException('Stripe session has no PaymentIntent');
      paymentIntent = session.payment_intent;
    }
    const refund = await this.request<StripeObject>('/v1/refunds', new URLSearchParams({ payment_intent: paymentIntent, amount: String(Math.round(Number(input.amount))), 'metadata[refundId]': input.refundId }), input.idempotencyKey);
    return { externalRefundId: refund.id, status: refund.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING' };
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): VerifiedPaymentWebhook {
    this.assertConfigured();
    const header = headers['stripe-signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature) throw new BadRequestException('Missing Stripe-Signature');
    const parts = new Map(signature.split(',').map((part) => part.split('=', 2) as [string, string]));
    const timestamp = parts.get('t') ?? '';
    const supplied = parts.get('v1') ?? '';
    if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new BadRequestException('Expired Stripe signature');
    const expected = createHmac('sha256', this.webhookSecret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(supplied);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new BadRequestException('Invalid Stripe signature');
    const event = JSON.parse(rawBody.toString('utf8')) as StripeEvent;
    const object = event.data.object;
    const map: Record<string, VerifiedPaymentWebhook['type']> = {
      'checkout.session.completed': 'PAYMENT_SUCCEEDED',
      'checkout.session.async_payment_succeeded': 'PAYMENT_SUCCEEDED',
      'checkout.session.async_payment_failed': 'PAYMENT_FAILED',
      'refund.updated': object.status === 'succeeded' ? 'REFUND_SUCCEEDED' : 'REFUND_FAILED',
    };
    const type = map[event.type];
    if (!type) throw new BadRequestException(`Unsupported Stripe event ${event.type}`);
    return { eventId: event.id, externalPaymentId: object.metadata?.sessionId ?? object.id, type, amount: object.amount_total === undefined ? undefined : String(object.amount_total), externalRefundId: type.startsWith('REFUND_') ? object.id : undefined };
  }

  private assertConfigured(): void { if (!this.isConfigured()) throw new BadRequestException('Stripe is not configured'); }
  private async get<T>(path: string): Promise<T> { return this.fetch<T>(path, { method: 'GET', headers: { Authorization: `Bearer ${this.secret}` } }); }
  private async request<T>(path: string, body: URLSearchParams, key: string): Promise<T> { return this.fetch<T>(path, { method: 'POST', headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': key }, body }); }
  private async fetch<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`https://api.stripe.com${path}`, { ...init, signal: AbortSignal.timeout(10_000) });
    const body = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) throw new BadGatewayException(body.error?.message ?? 'Stripe request failed');
    return body;
  }
}
