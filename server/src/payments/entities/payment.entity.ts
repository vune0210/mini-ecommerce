import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { PaymentRefund } from './payment-refund.entity';

export enum PaymentStatus {
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUND_PENDING = 'REFUND_PENDING',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
}

@Entity({ name: 'payments' })
@Index('IDX_payments_order_created_at', ['orderId', 'createdAt'])
@Index('UQ_payments_provider_external', ['provider', 'externalPaymentId'], {
  unique: true,
})
export class Payment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'order_id', type: 'varchar', length: 36 }) orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'order_id' })
  order: Order;
  /** String rather than enum so adding VNPay/MoMo/Stripe needs no schema edit. */
  @Column({ type: 'varchar', length: 32 }) provider: string;
  @Column({
    name: 'external_payment_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  externalPaymentId: string | null;
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) amount: string;
  @Column({
    name: 'refunded_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: '0.00',
  })
  refundedAmount: string;
  @Column({ type: 'char', length: 3, default: 'VND' }) currency: string;
  @Column({ name: 'failure_code', type: 'varchar', length: 64, nullable: true })
  failureCode: string | null;
  @Column({
    name: 'failure_message',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  failureMessage: string | null;
  @Column({ type: 'json', nullable: true }) metadata: Record<
    string,
    unknown
  > | null;
  @OneToMany(() => PaymentRefund, (refund) => refund.payment)
  refunds: PaymentRefund[];
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
