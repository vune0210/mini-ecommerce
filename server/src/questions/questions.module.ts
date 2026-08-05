import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { Product } from '../products/entities/product.entity';
import { AnswerVote } from './entities/answer-vote.entity';
import { ProductAnswer } from './entities/product-answer.entity';
import { ProductQuestion } from './entities/product-question.entity';
import {
  AdminQuestionsController,
  AnswersController,
  ProductQuestionsController,
  QuestionsController,
} from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductQuestion,
      ProductAnswer,
      AnswerVote,
      Product,
    ]),
    NotificationsModule,
  ],
  controllers: [
    ProductQuestionsController,
    QuestionsController,
    AnswersController,
    AdminQuestionsController,
  ],
  providers: [QuestionsService],
})
export class QuestionsModule {}
