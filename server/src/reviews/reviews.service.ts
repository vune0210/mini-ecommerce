import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrderStatus } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { UserRole } from '../users/entities/user.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import {
  ListAdminReviewsDto,
  ListReviewsDto,
  ReviewSort,
} from './dto/list-reviews.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewVote } from './entities/review-vote.entity';
import { Review } from './entities/review.entity';
import { RatingSummary, summaryFromRatingCounts } from './review-rules';

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  author: { id: string; name: string };
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** The moderation projection: everything above, plus the state staff act on. */
export type ModeratedReview = PublicReview & {
  isHidden: boolean;
  productId: string;
  productName: string | null;
};

export type ReviewListResponse = {
  items: PublicReview[];
  total: number;
  page: number;
  limit: number;
  summary: RatingSummary;
};

export type AdminReviewListResponse = {
  items: ModeratedReview[];
  total: number;
  page: number;
  limit: number;
};

@Injectable()
export class ReviewsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(OrderItem)
    private readonly orderItems: Repository<OrderItem>,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    productId: string,
    query: ListReviewsDto,
  ): Promise<ReviewListResponse> {
    await this.assertProduct(productId);
    const builder = this.reviews
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.user', 'user')
      .where('review.product_id = :productId', { productId })
      // Moderated reviews are invisible to the storefront, full stop.
      .andWhere('review.is_hidden = :hidden', { hidden: false });
    this.applyReviewFilters(builder, query);
    const total = await builder.getCount();
    const items = await this.applyReviewSort(builder, query.sort)
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    return {
      items: items.map((review) => this.serialize(review)),
      total,
      page: query.page,
      limit: query.limit,
      summary: await this.summaryFor(productId),
    };
  }

  /** Hidden reviews are excluded here too, so the average matches the list. */
  async summaryFor(productId: string): Promise<RatingSummary> {
    const rows = await this.reviews
      .createQueryBuilder('review')
      .select('review.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('review.product_id = :productId', { productId })
      .andWhere('review.is_hidden = :hidden', { hidden: false })
      .groupBy('review.rating')
      .getRawMany<{ rating: string | number; count: string | number }>();
    return summaryFromRatingCounts(rows);
  }

  /**
   * The viewer's own review, found regardless of which page it sits on — and
   * regardless of moderation: an author must be able to see that their review
   * was hidden rather than believe it vanished.
   */
  async findMine(
    userId: string,
    productId: string,
  ): Promise<(PublicReview & { isHidden: boolean }) | null> {
    const review = await this.reviews.findOne({
      where: { productId, userId },
      relations: { user: true },
    });
    return review
      ? { ...this.serialize(review), isHidden: review.isHidden }
      : null;
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

  /**
   * Records a helpful vote and keeps the denormalized counter in step, in one
   * transaction. Idempotent: a second vote from the same customer hits the
   * unique index and is swallowed rather than counted twice, so a
   * double-tapped button cannot inflate a review's ranking.
   */
  async vote(id: string, userId: string): Promise<PublicReview> {
    await this.dataSource.transaction(async (manager) => {
      const review = await manager.getRepository(Review).findOneBy({ id });
      if (!review) throw new NotFoundException('Review not found');
      if (review.userId === userId)
        throw new ForbiddenException(
          'You cannot mark your own review as helpful',
        );
      try {
        await manager
          .getRepository(ReviewVote)
          .insert({ reviewId: id, userId });
      } catch (error) {
        const duplicate =
          error instanceof QueryFailedError &&
          (error as QueryFailedError & { code?: string }).code ===
            'ER_DUP_ENTRY';
        if (duplicate) return;
        throw error;
      }
      await manager.getRepository(Review).increment({ id }, 'helpfulCount', 1);
    });
    return this.serialize(await this.reviewWithAuthor(id));
  }

  async unvote(id: string, userId: string): Promise<PublicReview> {
    await this.dataSource.transaction(async (manager) => {
      const removed = await manager
        .getRepository(ReviewVote)
        .delete({ reviewId: id, userId });
      // Only decrement when a vote was actually removed; otherwise a repeated
      // un-vote drives the counter below the number of rows backing it.
      if (!removed.affected) return;
      await manager.getRepository(Review).decrement({ id }, 'helpfulCount', 1);
    });
    return this.serialize(await this.reviewWithAuthor(id));
  }

  /** The moderation queue: hidden reviews included, newest first by default. */
  async findAllForAdmin(
    query: ListAdminReviewsDto,
  ): Promise<AdminReviewListResponse> {
    const builder = this.reviews
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.user', 'user')
      .leftJoinAndSelect('review.product', 'product');
    if (query.productId)
      builder.andWhere('review.product_id = :productId', {
        productId: query.productId,
      });
    if (query.isHidden !== undefined)
      builder.andWhere('review.is_hidden = :hidden', {
        hidden: query.isHidden,
      });
    this.applyReviewFilters(builder, query);
    const total = await builder.getCount();
    const items = await this.applyReviewSort(builder, query.sort)
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    return {
      items: items.map((review) => ({
        ...this.serialize(review),
        isHidden: review.isHidden,
        productId: review.productId,
        productName: review.product?.name ?? null,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async moderate(id: string, dto: ModerateReviewDto): Promise<ModeratedReview> {
    const review = await this.reviews.findOne({
      where: { id },
      relations: { user: true, product: true },
    });
    if (!review) throw new NotFoundException('Review not found');
    const changed = review.isHidden !== dto.isHidden;
    review.isHidden = dto.isHidden;
    await this.reviews.save(review);
    // Only on an actual change: re-saving the same state is a moderator
    // double-click, not news. Emitted outside a transaction because the save
    // above is a single statement that has already committed — there is no
    // wider unit of work for the notification to join.
    if (changed)
      await this.notifications.notify(null, {
        userId: review.userId,
        type: NotificationType.REVIEW_MODERATED,
        title: dto.isHidden
          ? 'Đánh giá của bạn đã bị ẩn'
          : 'Đánh giá của bạn đã hiển thị trở lại',
        body: dto.isHidden
          ? `Đánh giá cho “${review.product?.name ?? 'sản phẩm'}” đã bị ẩn khỏi gian hàng. Nội dung vẫn được giữ và có thể hiển thị lại.`
          : `Đánh giá cho “${review.product?.name ?? 'sản phẩm'}” đã được hiển thị lại.`,
        metadata: { productId: review.productId, reviewId: review.id },
      });
    return {
      ...this.serialize(review),
      isHidden: review.isHidden,
      productId: review.productId,
      productName: review.product?.name ?? null,
    };
  }

  private applyReviewFilters(
    builder: SelectQueryBuilder<Review>,
    query: ListReviewsDto,
  ): SelectQueryBuilder<Review> {
    if (query.rating !== undefined)
      builder.andWhere('review.rating = :rating', { rating: query.rating });
    if (query.withComment)
      builder.andWhere("review.comment IS NOT NULL AND review.comment <> ''");
    return builder;
  }

  /** The id tiebreak keeps pages stable when several rows share a sort value. */
  private applyReviewSort(
    builder: SelectQueryBuilder<Review>,
    sort: ReviewSort,
  ): SelectQueryBuilder<Review> {
    if (sort === ReviewSort.HELPFUL)
      builder
        .orderBy('review.helpfulCount', 'DESC')
        .addOrderBy('review.createdAt', 'DESC');
    else if (sort === ReviewSort.RATING_DESC)
      builder
        .orderBy('review.rating', 'DESC')
        .addOrderBy('review.createdAt', 'DESC');
    else if (sort === ReviewSort.RATING_ASC)
      builder
        .orderBy('review.rating', 'ASC')
        .addOrderBy('review.createdAt', 'DESC');
    else builder.orderBy('review.createdAt', 'DESC');
    return builder.addOrderBy('review.id', 'ASC');
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
      helpfulCount: review.helpfulCount,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}
