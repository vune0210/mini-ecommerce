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
import { OrderItem } from '../../orders/entities/order-item.entity';
import { ReturnRequest } from './return-request.entity';

// Index names match AddReturnRequests so migration:generate does not propose
// dropping and recreating them.
@Entity({ name: 'return_request_items' })
@Index('IDX_return_request_items_request', ['returnRequestId'])
// The claim check sums this table by order item, so the lookup column is
// indexed rather than left to the FK's implicit index.
@Index('IDX_return_request_items_order_item', ['orderItemId'])
export class ReturnRequestItem {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => ReturnRequest, (request) => request.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'return_request_id' })
  returnRequest: ReturnRequest;

  @Column({ name: 'return_request_id', type: 'varchar', length: 36 })
  returnRequestId: string;

  /**
   * RESTRICT: the order line is what proves the unit was bought at all, and it
   * is also where the product to restock is read from when the goods arrive.
   */
  @ManyToOne(() => OrderItem, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'order_item_id' })
  orderItem: OrderItem;

  @Column({ name: 'order_item_id', type: 'varchar', length: 36 })
  orderItemId: string;

  /** Snapshot: the request stays readable after the product is delisted. */
  @Column({ name: 'product_name', type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'int', unsigned: true }) quantity: number;

  /** Copied from the order line, never from the current product price. */
  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 }) subtotal: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
