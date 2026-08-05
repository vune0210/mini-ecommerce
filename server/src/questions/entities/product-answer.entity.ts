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
import { ProductQuestion } from './product-question.entity';

// The index name matches AddProductQuestions so migration:generate does not
// propose dropping and recreating it.
@Entity({ name: 'product_answers' })
@Index('IDX_product_answers_question_hidden', ['questionId', 'isHidden'])
export class ProductAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductQuestion, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'question_id' })
  question: ProductQuestion;

  @Column({ name: 'question_id', type: 'varchar', length: 36 })
  questionId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 1000 })
  body: string;

  /**
   * True when an admin wrote this answer — the badge that tells a shopper the
   * shop itself is speaking. Stored rather than derived from the author's
   * current role for two reasons: joining `users` on every read to decide a
   * badge is wasteful, and a role change must not rewrite history. An admin who
   * later becomes a customer said what they said as the shop; a customer
   * promoted to admin did not.
   */
  @Column({ name: 'is_official', type: 'boolean', default: false })
  isOfficial: boolean;

  /** Same moderation contract as the question: reversible, and the row stays. */
  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden: boolean;

  /**
   * Denormalized count of `answer_votes`, kept because answers are ordered by
   * it. Written only through the helpful endpoints, which keep it in step with
   * the vote rows inside a transaction.
   */
  @Column({ name: 'helpful_count', type: 'int', unsigned: true, default: 0 })
  helpfulCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
