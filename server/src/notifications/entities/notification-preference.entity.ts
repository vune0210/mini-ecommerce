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
import { User } from '../../users/entities/user.entity';

/**
 * Per-customer mute switches, one boolean per category rather than one per
 * `NotificationType`. Types are an implementation detail that grows with the
 * codebase; categories are what a settings screen can honestly label, and
 * adding a new order-ish type must not silently un-mute someone who already
 * said they did not want order mail.
 *
 * Every column defaults to true (opt-out). A row is created lazily on the first
 * PATCH, so a missing row means "all defaults" and is never an error — see
 * `serializePreferences` in notification-rules.
 *
 * There is deliberately no switch for ACCOUNT_SECURITY. "Your password was
 * changed" is how account takeover gets noticed; a customer who muted it once
 * would never learn that muting it was the attacker's first move.
 */
@Entity({ name: 'notification_preferences' })
@Index('UQ_notification_preferences_user', ['userId'], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  /** ORDER_PLACED and ORDER_STATUS_CHANGED. */
  @Column({ name: 'order_updates', type: 'boolean', default: true })
  orderUpdates: boolean;

  /** REVIEW_MODERATED. */
  @Column({ name: 'review_updates', type: 'boolean', default: true })
  reviewUpdates: boolean;

  /** COUPON_EXPIRING — the only marketing-shaped category. */
  @Column({ type: 'boolean', default: true })
  promotions: boolean;

  /** STOCK_BACK. */
  @Column({ name: 'stock_alerts', type: 'boolean', default: true })
  stockAlerts: boolean;

  /** ANSWER_POSTED. */
  @Column({ name: 'product_answers', type: 'boolean', default: true })
  productAnswers: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
