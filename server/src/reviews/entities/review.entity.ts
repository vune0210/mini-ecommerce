import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

// The composite index name matches AddReviewModeration so migration:generate
// does not propose dropping and recreating it.
@Entity({ name: 'reviews' })
@Unique('UQ_reviews_user_product', ['userId', 'productId'])
@Index('IDX_reviews_product', ['productId'])
@Index('IDX_reviews_product_hidden', ['productId', 'isHidden'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id', type: 'varchar', length: 36 })
  productId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'tinyint', unsigned: true })
  rating: number;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment: string | null;

  /**
   * Moderated out of sight. Hidden rather than deleted so the author is not
   * invited to simply post it again, and so a wrong call is reversible.
   * Hidden reviews are excluded from the public list, the rating summary and
   * the product average — a moderated review must not keep moving the score.
   */
  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden: boolean;

  /**
   * Denormalized count of `review_votes`. Stored because reviews are sorted by
   * it: an aggregate in the ORDER BY would rule out any index on the sort.
   * Written only through the vote endpoints, which keep it in step inside a
   * transaction.
   */
  @Column({ name: 'helpful_count', type: 'int', unsigned: true, default: 0 })
  helpfulCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
