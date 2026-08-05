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
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

// The index names match AddProductQuestions so migration:generate does not
// propose dropping and recreating them.
@Entity({ name: 'product_questions' })
@Index('IDX_product_questions_product_hidden', ['productId', 'isHidden'])
@Index('IDX_product_questions_hidden_answers', ['isHidden', 'answerCount'])
export class ProductQuestion {
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

  @Column({ type: 'varchar', length: 1000 })
  body: string;

  /**
   * Moderated out of sight. Hidden rather than deleted so the asker is not
   * invited to simply post it again, and so a wrong call is reversible.
   * A hidden question takes its whole thread with it: the storefront skips it,
   * and no further answers can be attached to it.
   */
  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden: boolean;

  /**
   * Denormalized count of the question's *visible* answers. Stored because the
   * list is sorted and filtered by it — an aggregate in the ORDER BY would rule
   * out any index on the sort, and `unansweredOnly` would become a HAVING over
   * a join. Counting only visible answers is deliberate: a question whose only
   * answer was moderated away is unanswered again as far as a shopper (and the
   * moderation queue) is concerned.
   *
   * Written only through the answer and visibility endpoints, which keep it in
   * step inside a transaction.
   */
  @Column({ name: 'answer_count', type: 'int', unsigned: true, default: 0 })
  answerCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
