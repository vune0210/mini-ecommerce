import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CouponType {
  /** `value` is a percentage of the cart subtotal. */
  PERCENT = 'PERCENT',
  /** `value` is a fixed amount in the store currency. */
  FIXED = 'FIXED',
}

// Index names match their migrations so migration:generate does not propose
// dropping and recreating them.
@Entity({ name: 'coupons' })
@Index('UQ_coupons_code', ['code'], { unique: true })
@Index('IDX_coupons_public_active', ['isPublic', 'isActive'])
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stored upper-cased so lookups are exact regardless of how it was typed. */
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: CouponType })
  type: CouponType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value: string;

  /** Cart subtotal the order must reach before the code applies. */
  @Column({
    name: 'min_subtotal',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  minSubtotal: string | null;

  /** Caps a PERCENT coupon so a large cart cannot drain the discount budget. */
  @Column({
    name: 'max_discount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  maxDiscount: string | null;

  @Column({ name: 'starts_at', type: 'datetime', precision: 6, nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'datetime', precision: 6, nullable: true })
  endsAt: Date | null;

  /** Total redemptions allowed across all customers; null means unlimited. */
  @Column({ name: 'usage_limit', type: 'int', unsigned: true, nullable: true })
  usageLimit: number | null;

  @Column({ name: 'usage_count', type: 'int', unsigned: true, default: 0 })
  usageCount: number;

  @Column({
    name: 'per_user_limit',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  perUserLimit: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Whether the code may be advertised to customers who did not already have
   * it. Defaults to false so every coupon that existed before this column did
   * stays private: a targeted code mailed to twenty people must not become a
   * public promo because a listing endpoint was added later.
   */
  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
