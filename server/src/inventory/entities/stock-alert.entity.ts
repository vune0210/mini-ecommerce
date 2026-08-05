import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

/**
 * "Tell me when this is back." One row per customer per product, deleted the
 * moment the alert fires rather than flagged as sent: a subscription that has
 * already been honoured is not a record anyone needs, and deleting it is what
 * lets the same customer subscribe again the next time the product sells out.
 *
 * The unique pair is the real guard against double-subscribing — a read-then-
 * insert races two taps into two rows and then into two notifications.
 */
@Entity({ name: 'stock_alerts' })
@Unique('UQ_stock_alerts_user_product', ['userId', 'productId'])
@Index('IDX_stock_alerts_product', ['productId'])
export class StockAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id', type: 'varchar', length: 36 })
  productId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
