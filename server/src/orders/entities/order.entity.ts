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
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  /** Cash on delivery — the default, and the only one needing no gateway. */
  COD = 'COD',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

// Index names match AddOrderShippingDetails so migration:generate does not
// propose dropping and recreating them.
@Entity({ name: 'orders' })
@Index('UQ_orders_order_number', ['orderNumber'], { unique: true })
@Index('IDX_orders_status_created_at', ['status', 'createdAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid') id: string;
  // nullable: false matches the migration's NOT NULL column; without it
  // migration:generate proposes widening user_id on every run.
  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
  @OneToMany(() => OrderItem, (item) => item.order) items: OrderItem[];
  @Column({ name: 'order_number', type: 'varchar', length: 24 })
  orderNumber: string;
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;
  /**
   * The money breakdown always satisfies
   * `total_amount = subtotal_amount - discount_amount + shipping_fee`.
   * Every component is stored rather than derived: prices, shipping rules and
   * coupon definitions all change, and an invoice has to keep reading the same
   * years later.
   */
  @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2 })
  totalAmount: string;
  @Column({ name: 'subtotal_amount', type: 'decimal', precision: 10, scale: 2 })
  subtotalAmount: string;
  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: '0.00',
  })
  discountAmount: string;
  @Column({
    name: 'shipping_fee',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: '0.00',
  })
  shippingFee: string;
  /** Null once the coupon row is deleted; `couponCode` survives as the record. */
  @Column({ name: 'coupon_id', type: 'varchar', length: 36, nullable: true })
  couponId: string | null;
  @Column({ name: 'coupon_code', type: 'varchar', length: 40, nullable: true })
  couponCode: string | null;
  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.COD,
  })
  paymentMethod: PaymentMethod;
  /** Set the first time the order reaches PAID; never cleared afterwards. */
  @Column({ name: 'paid_at', type: 'datetime', precision: 6, nullable: true })
  paidAt: Date | null;
  @Column({ name: 'recipient_name', type: 'varchar', length: 100 })
  recipientName: string;
  @Column({ type: 'varchar', length: 20 })
  phone: string;
  @Column({ name: 'address_line', type: 'varchar', length: 255 })
  addressLine: string;
  @Column({ type: 'varchar', length: 100, nullable: true })
  ward: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true })
  district: string | null;
  @Column({ type: 'varchar', length: 100 })
  city: string;
  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
