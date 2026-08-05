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
import { User } from '../../users/entities/user.entity';
import { ReturnRequestItem } from './return-request-item.entity';

export enum ReturnStatus {
  /** Filed by the customer, waiting for a decision. */
  REQUESTED = 'REQUESTED',
  /** Accepted; the goods are on their way back to the warehouse. */
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  /** The goods are physically back — the only status that moves stock. */
  RECEIVED = 'RECEIVED',
  REFUNDED = 'REFUNDED',
  /** Withdrawn by the customer before anyone acted on it. */
  CANCELLED = 'CANCELLED',
}

export enum ReturnReason {
  DAMAGED = 'DAMAGED',
  WRONG_ITEM = 'WRONG_ITEM',
  NOT_AS_DESCRIBED = 'NOT_AS_DESCRIBED',
  CHANGED_MIND = 'CHANGED_MIND',
  OTHER = 'OTHER',
}

// Index names match AddReturnRequests so migration:generate does not propose
// dropping and recreating them.
@Entity({ name: 'return_requests' })
@Index('UQ_return_requests_request_number', ['requestNumber'], { unique: true })
@Index('IDX_return_requests_user_created_at', ['userId', 'createdAt'])
// Serves the "how much of this order is already claimed" lookup that guards
// every new request, and the admin filter by status.
@Index('IDX_return_requests_order_status', ['orderId', 'status'])
@Index('IDX_return_requests_status_created_at', ['status', 'createdAt'])
export class ReturnRequest {
  @PrimaryGeneratedColumn('uuid') id: string;

  /**
   * RESTRICT in both directions: a return is evidence about money and stock, so
   * neither the order it disputes nor the customer who filed it may be deleted
   * out from under it.
   */
  @ManyToOne(() => Order, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id', type: 'varchar', length: 36 }) orderId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 }) userId: string;

  @Column({ name: 'request_number', type: 'varchar', length: 24 })
  requestNumber: string;

  @Column({ type: 'enum', enum: ReturnStatus, default: ReturnStatus.REQUESTED })
  status: ReturnStatus;

  @Column({ type: 'enum', enum: ReturnReason })
  reason: ReturnReason;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  /**
   * Frozen when the request is filed, from the prices the customer actually
   * paid. Never recomputed from the catalogue: a product repriced between the
   * sale and the return must not change what is owed back.
   */
  @Column({ name: 'refund_amount', type: 'decimal', precision: 10, scale: 2 })
  refundAmount: string;

  /** Stamped once, on the first transition into a terminal status. */
  @Column({
    name: 'resolved_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  resolvedAt: Date | null;

  @OneToMany(() => ReturnRequestItem, (item) => item.returnRequest)
  items: ReturnRequestItem[];

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
