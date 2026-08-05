import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { ReviewVote } from './entities/review-vote.entity';
import { Review } from './entities/review.entity';
import {
  AdminReviewsController,
  ProductReviewsController,
  ReviewsController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, ReviewVote, Product, OrderItem]),
    NotificationsModule,
  ],
  controllers: [
    ProductReviewsController,
    ReviewsController,
    AdminReviewsController,
  ],
  providers: [ReviewsService],
})
export class ReviewsModule {}
