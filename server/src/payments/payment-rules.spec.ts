import { PaymentStatus } from './entities/payment.entity';
import {
  normalizeMoney,
  paymentStatusAfterRefund,
  refundableAmount,
  webhookPayloadHash,
} from './payment-rules';

describe('payment rules', () => {
  it('normalizes money and rejects invalid values', () => {
    expect(normalizeMoney('1200')).toBe('1200.00');
    expect(() => normalizeMoney(-1)).toThrow(/non-negative/);
  });

  it('calculates the remaining refundable amount', () => {
    expect(
      refundableAmount({ amount: '100.00', refundedAmount: '30.00' }),
    ).toBe('70.00');
  });

  it('distinguishes pending, partial and full refunds', () => {
    expect(paymentStatusAfterRefund('100.00', '0.00', true)).toBe(
      PaymentStatus.REFUND_PENDING,
    );
    expect(paymentStatusAfterRefund('100.00', '20.00', false)).toBe(
      PaymentStatus.PARTIALLY_REFUNDED,
    );
    expect(paymentStatusAfterRefund('100.00', '100.00', false)).toBe(
      PaymentStatus.REFUNDED,
    );
  });

  it('hashes webhook payloads deterministically without storing the body', () => {
    expect(webhookPayloadHash(Buffer.from('event'))).toHaveLength(64);
    expect(webhookPayloadHash(Buffer.from('event'))).toBe(
      webhookPayloadHash(Buffer.from('event')),
    );
  });
});
