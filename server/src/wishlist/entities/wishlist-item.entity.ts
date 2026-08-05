import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

/**
 * One row per saved product. The unique pair is the real guard against
 * double-saving: a read-then-insert races two rapid taps into two rows.
 *
 * The product reference cascades on delete — unlike a cart line, a wishlist
 * entry has no money or stock attached, so a delisted product should simply
 * disappear from everyone's list rather than block the deletion.
 */
@Entity({ name: 'wishlist_items' })
@Unique('UQ_wishlist_items_user_product', ['userId', 'productId'])
export class WishlistItem {
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
