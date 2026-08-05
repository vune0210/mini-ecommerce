import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Review } from './review.entity';

/**
 * One "helpful" vote per customer per review. The unique pair is what makes the
 * count trustworthy: without it a held-down button inflates a review's
 * usefulness, and usefulness is what decides which review appears first.
 */
@Entity({ name: 'review_votes' })
@Unique('UQ_review_votes_review_user', ['reviewId', 'userId'])
export class ReviewVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Review, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'review_id' })
  review: Review;

  @Column({ name: 'review_id', type: 'varchar', length: 36 })
  reviewId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
