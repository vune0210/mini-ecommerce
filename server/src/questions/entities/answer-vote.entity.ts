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
import { ProductAnswer } from './product-answer.entity';

/**
 * One "helpful" vote per customer per answer. The unique pair is what makes the
 * count trustworthy: without it a held-down button inflates an answer's
 * usefulness, and usefulness is what decides which answer a shopper reads
 * first once the official ones are out of the way.
 */
@Entity({ name: 'answer_votes' })
@Unique('UQ_answer_votes_answer_user', ['answerId', 'userId'])
export class AnswerVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductAnswer, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'answer_id' })
  answer: ProductAnswer;

  @Column({ name: 'answer_id', type: 'varchar', length: 36 })
  answerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
