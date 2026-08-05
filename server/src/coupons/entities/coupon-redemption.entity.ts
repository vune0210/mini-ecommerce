import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { Coupon } from './coupon.entity';

/**
 * One row per successful application of a coupon to an order. This is the
 * ledger the per-user limit is counted from, and the record a cancellation
 * reverses — `coupons.usage_count` alone could not say who spent the budget.
 *
 * The unique order_id is what makes releasing a redemption idempotent: a
 * double-cancel cannot credit the same order twice.
 */
@Entity({ name: 'coupon_redemptions' })
@Index('IDX_coupon_redemptions_coupon_user', ['couponId', 'userId'])
@Index('UQ_coupon_redemptions_order', ['orderId'], { unique: true })
export class CouponRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Coupon, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'coupon_id' })
  coupon: Coupon;

  @Column({ name: 'coupon_id', type: 'varchar', length: 36 })
  couponId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id', type: 'varchar', length: 36 })
  orderId: string;

  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  discountAmount: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
