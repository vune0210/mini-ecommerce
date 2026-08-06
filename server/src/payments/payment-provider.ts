export type CreatePaymentInput = {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  amount: string;
  currency: string;
  returnUrl: string;
};

export type CreatePaymentResult = {
  externalPaymentId: string;
  redirectUrl?: string;
  metadata?: Record<string, unknown>;
};

export type RefundPaymentInput = {
  paymentId: string;
  externalPaymentId: string;
  refundId: string;
  amount: string;
  reason: string | null;
  idempotencyKey: string;
};

export type RefundPaymentResult = {
  externalRefundId: string;
  status: 'PENDING' | 'SUCCEEDED';
};

export type VerifiedPaymentWebhook = {
  eventId: string;
  externalPaymentId: string;
  type:
    | 'PAYMENT_SUCCEEDED'
    | 'PAYMENT_FAILED'
    | 'REFUND_SUCCEEDED'
    | 'REFUND_FAILED';
  amount?: string;
  externalRefundId?: string;
};

/** Provider adapters own signature verification and raw payload parsing. */
export interface PaymentProviderAdapter {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  refund(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): VerifiedPaymentWebhook | Promise<VerifiedPaymentWebhook>;
}

export const PAYMENT_PROVIDER_ADAPTERS = Symbol('PAYMENT_PROVIDER_ADAPTERS');
