import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum NotificationType {
  /** An order moved between statuses — PAID, SHIPPED, CANCELLED and so on. */
  ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
  /** Checkout succeeded; the receipt the customer expects to see. */
  ORDER_PLACED = 'ORDER_PLACED',
  /** Staff hid or restored one of the customer's reviews. */
  REVIEW_MODERATED = 'REVIEW_MODERATED',
  /** A coupon the customer can still use is about to expire. */
  COUPON_EXPIRING = 'COUPON_EXPIRING',
  /** A product the customer waited on is in stock again. */
  STOCK_BACK = 'STOCK_BACK',
  /** Someone answered the customer's question on a product. */
  ANSWER_POSTED = 'ANSWER_POSTED',
  /** Password changed, new login, sessions revoked. Never mutable. */
  ACCOUNT_SECURITY = 'ACCOUNT_SECURITY',
}

/**
 * The structured payload a notification carries alongside its prose, kept flat
 * and scalar on purpose. It exists so the SPA can rebuild a link or a badge
 * without re-parsing `title`; it is not a place to mirror the order. Anything
 * nested would grow into a second, un-migrated copy of a real table.
 */
export type NotificationMetadata = Record<
  string,
  string | number | boolean | null
>;

/**
 * One row per delivered in-app notification. Durable rather than pushed-and-
 * forgotten: a customer who was offline when their order shipped still has to
 * find that out, and an inbox they can re-read is the only version of this
 * feature that survives a closed browser tab.
 *
 * Text is snapshotted, not rendered from the referenced entity at read time.
 * "Your order was cancelled" must keep saying that after the order is
 * re-instated, because it is a record of what the customer was told.
 */
// Index names are spelled out and match AddNotifications exactly, for the same
// reason orders does it: an unnamed @Index makes TypeORM invent a hash-suffixed
// name, and the next `migration:generate` proposes dropping the migration's
// index to recreate its own.
@Entity({ name: 'notifications' })
@Index('IDX_notifications_user_read_at', ['userId', 'readAt'])
@Index('IDX_notifications_user_created_at', ['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // CASCADE: an inbox has no meaning without its owner, and unlike the stock
  // ledger nobody audits a deleted customer's notifications.
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  body: string | null;

  /**
   * A relative SPA path such as `/orders/<id>`. Relative on purpose: an absolute
   * URL would freeze today's origin into rows that outlive the domain, and a
   * stored `http://` link is one bad emit away from being an open redirect.
   */
  @Column({ type: 'varchar', length: 512, nullable: true })
  link: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: NotificationMetadata | null;

  /** Null while unread. The timestamp, not a flag: "when" is free to store. */
  @Column({ name: 'read_at', type: 'datetime', precision: 6, nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
