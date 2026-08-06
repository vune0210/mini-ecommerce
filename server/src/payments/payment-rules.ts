import { createHash } from 'node:crypto';
import { PaymentStatus } from './entities/payment.entity';

export function normalizeMoney(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error('Amount must be a non-negative finite number');
  return amount.toFixed(2);
}

export function refundableAmount(payment: {
  amount: string;
  refundedAmount: string;
}): string {
  return Math.max(
    0,
    Number(payment.amount) - Number(payment.refundedAmount),
  ).toFixed(2);
}

export function paymentStatusAfterRefund(
  amount: string,
  refundedAmount: string,
  pending: boolean,
): PaymentStatus {
  if (pending) return PaymentStatus.REFUND_PENDING;
  return Number(refundedAmount) >= Number(amount)
    ? PaymentStatus.REFUNDED
    : PaymentStatus.PARTIALLY_REFUNDED;
}

export function webhookPayloadHash(rawBody: Buffer): string {
  return createHash('sha256').update(rawBody).digest('hex');
}
