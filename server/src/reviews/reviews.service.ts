import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrderStatus } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { UserRole } from '../users/entities/user.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { Review } from './entities/review.entity';
import { RatingSummary, summaryFromRatingCounts } from './review-rules';

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  author: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
};

export type ReviewListResponse = {
  items: PublicReview[];
  total: number;
  page: number;
  limit: number;
  summary: RatingSummary;
};

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(OrderItem)
    private readonly orderItems: Repository<OrderItem>,
  ) {}

  async list(
    productId: string,
    query: ListReviewsDto,
  ): Promise<ReviewListResponse> {
    await this.assertProduct(productId);
    const [items, total] = await this.reviews.findAndCount({
      where: { productId },
      relations: { user: true },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: items.map((review) => this.serialize(review)),
      total,
      page: query.page,
      limit: query.limit,
      summary: await this.summaryFor(productId),
    };
  }

  async summaryFor(productId: string): Promise<RatingSummary> {
    const rows = await this.reviews
      .createQueryBuilder('review')
      .select('review.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('review.product_id = :productId', { productId })
      .groupBy('review.rating')
      .getRawMany<{ rating: string | number; count: string | number }>();
    return summaryFromRatingCounts(rows);
  }

  /** The viewer's own review, found regardless of which page it sits on. */
  async findMine(
    userId: string,
    productId: string,
  ): Promise<PublicReview | null> {
    const review = await this.reviews.findOne({
      where: { productId, userId },
      relations: { user: true },
    });
    return review ? this.serialize(review) : null;
  }

  async create(
    user: AuthenticatedUser,
    productId: string,
    dto: CreateReviewDto,
  ): Promise<PublicReview> {
    await this.assertProduct(productId);
    if (await this.reviews.findOneBy({ productId, userId: user.id }))
      throw new ConflictException('You have already reviewed this product');
    if (!(await this.hasCompletedPurchase(user.id, productId)))
      throw new ForbiddenException(
        'Only a completed order for this product allows a review',
      );
    const saved = await this.reviews.save(
      this.reviews.create({
        productId,
        userId: user.id,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      }),
    );
    return this.serialize(await this.reviewWithAuthor(saved.id));
  }

  async update(
    id: string,
    user: AuthenticatedUser,
    dto: UpdateReviewDto,
  ): Promise<PublicReview> {
    const review = await this.reviewWithAuthor(id);
    if (review.userId !== user.id)
      throw new ForbiddenException('You can only edit your own review');
    if (dto.rating !== undefined && dto.rating !== null)
      review.rating = dto.rating;
    if (dto.comment !== undefined) review.comment = dto.comment?.trim() || null;
    await this.reviews.save(review);
    return this.serialize(await this.reviewWithAuthor(id));
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const review = await this.reviewWithAuthor(id);
    if (review.userId !== user.id && user.role !== UserRole.ADMIN)
      throw new ForbiddenException('You can only delete your own review');
    await this.reviews.remove(review);
  }

  private hasCompletedPurchase(
    userId: string,
    productId: string,
  ): Promise<boolean> {
    return this.orderItems
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .where('item.product_id = :productId', { productId })
      .andWhere('order.user_id = :userId', { userId })
      .andWhere('order.status = :status', { status: OrderStatus.COMPLETED })
      .getExists();
  }

  private async assertProduct(productId: string): Promise<void> {
    if (!(await this.products.findOneBy({ id: productId })))
      throw new NotFoundException('Product not found');
  }

  private async reviewWithAuthor(id: string): Promise<Review> {
    const review = await this.reviews.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  /** Never exposes the reviewer's email — only the display name. */
  private serialize(review: Review): PublicReview {
    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      author: { id: review.userId, name: review.user.name },
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}
