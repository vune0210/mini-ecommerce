import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Payment } from './payment.entity';

export enum RefundStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity({ name: 'payment_refunds' })
@Index('UQ_payment_refunds_payment_key', ['paymentId', 'idempotencyKey'], {
  unique: true,
})
@Index(
  'UQ_payment_refunds_provider_external',
  ['provider', 'externalRefundId'],
  {
    unique: true,
  },
)
export class PaymentRefund {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'payment_id', type: 'varchar', length: 36 })
  paymentId: string;
  @ManyToOne(() => Payment, (payment) => payment.refunds, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;
  @Column({ type: 'varchar', length: 32 }) provider: string;
  @Column({
    name: 'external_refund_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  externalRefundId: string | null;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey: string;
  @Column({ type: 'enum', enum: RefundStatus, default: RefundStatus.PENDING })
  status: RefundStatus;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) amount: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) reason:
    string | null;
  @Column({ name: 'requested_by', type: 'varchar', length: 36, nullable: true })
  requestedBy: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
