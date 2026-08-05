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
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

export enum StockMovementReason {
  /** Checkout reserved units for an order. */
  SALE = 'SALE',
  /** A cancelled order returned its units. */
  CANCELLATION = 'CANCELLATION',
  /** An admin corrected the count by hand. */
  ADJUSTMENT = 'ADJUSTMENT',
  /** New units arrived from a supplier. */
  RESTOCK = 'RESTOCK',
  /**
   * A customer sent delivered goods back and the return was received. Its own
   * member rather than a reuse: CANCELLATION would assert that a completed,
   * delivered order had been cancelled, and ADJUSTMENT would flatten it into
   * "someone corrected the count" — the ledger exists so neither becomes the
   * record. Declared last because the migration appends it last.
   */
  RETURN = 'RETURN',
}

/**
 * Append-only ledger of every stock change. `products.stock` is a running
 * balance and answers "how many now"; only this table answers "where did they
 * go", which is the question asked when the shelf count and the system
 * disagree.
 *
 * `balance_after` is stored rather than derived so a single row is meaningful
 * on its own — reconstructing it would mean replaying the whole ledger, and any
 * gap (a pre-ledger order, a manual SQL fix) would silently shift every later
 * number.
 */
@Entity({ name: 'stock_movements' })
@Index('IDX_stock_movements_product_created_at', ['productId', 'createdAt'])
@Index('IDX_stock_movements_created_at', ['createdAt'])
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'product_id', type: 'varchar', length: 36, nullable: true })
  productId: string | null;

  /** Snapshot: the ledger must stay readable after the product is delisted. */
  @Column({ name: 'product_name', type: 'varchar', length: 255 })
  productName: string;

  /** Signed: negative consumes stock, positive returns or adds it. */
  @Column({ type: 'int' })
  delta: number;

  @Column({ name: 'balance_after', type: 'int', unsigned: true })
  balanceAfter: number;

  @Column({ type: 'enum', enum: StockMovementReason })
  reason: StockMovementReason;

  @ManyToOne(() => Order, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  @Column({ name: 'order_id', type: 'varchar', length: 36, nullable: true })
  orderId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser: User | null;

  @Column({
    name: 'actor_user_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  actorUserId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
