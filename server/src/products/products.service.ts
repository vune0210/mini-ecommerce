import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { Review } from '../reviews/entities/review.entity';
import { emptyRatingAggregate, ratingSummaries } from '../reviews/review-rules';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto, ProductSort } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
  ) {}
  async findAll(
    query: ListProductsDto,
  ): Promise<{ items: Product[]; total: number; page: number; limit: number }> {
    const builder = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category');
    this.applyFilters(builder, query);
    const total = await builder.getCount();
    const items =
      query.sort === ProductSort.RATING_DESC
        ? await this.pageByRating(query)
        : await this.applySort(builder, query.sort)
            .skip((query.page - 1) * query.limit)
            .take(query.limit)
            .getMany();
    return {
      items: await this.attachRatings(items),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
  async findOne(id: string): Promise<Product> {
    const product = await this.products.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return (await this.attachRatings([product]))[0];
  }
  async create(dto: CreateProductDto): Promise<Product> {
    if (await this.products.findOneBy({ slug: dto.slug }))
      throw new ConflictException('Product slug already exists');
    const category = await this.category(dto.categoryId);
    return this.products.save(
      this.products.create({
        ...dto,
        name: dto.name.trim(),
        description: dto.description.trim(),
        category,
        imageUrl: dto.imageUrl ?? null,
        price: dto.price.toFixed(2),
      }),
    );
  }
  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    if (
      dto.slug &&
      dto.slug !== product.slug &&
      (await this.products.findOneBy({ slug: dto.slug }))
    )
      throw new ConflictException('Product slug already exists');
    if (dto.categoryId) {
      product.category = await this.category(dto.categoryId);
      product.categoryId = dto.categoryId;
    }
    Object.assign(
      product,
      dto.name ? { name: dto.name.trim() } : {},
      dto.description ? { description: dto.description.trim() } : {},
      dto.slug ? { slug: dto.slug } : {},
      dto.price !== undefined ? { price: dto.price.toFixed(2) } : {},
      dto.stock !== undefined ? { stock: dto.stock } : {},
      dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {},
    );
    return this.products.save(product);
  }
  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    try {
      await this.products.remove(product);
    } catch (error) {
      // cart_items holds an ON DELETE RESTRICT reference, so a product sitting
      // in someone's cart cannot be deleted. Report that instead of a raw 500.
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code ===
          'ER_ROW_IS_REFERENCED_2'
      )
        throw new ConflictException(
          'Product is still referenced by a cart and cannot be deleted',
        );
      throw error;
    }
  }
  private applyFilters(
    builder: SelectQueryBuilder<Product>,
    query: ListProductsDto,
  ): SelectQueryBuilder<Product> {
    if (query.search)
      builder.andWhere('LOWER(product.name) LIKE LOWER(:search)', {
        search: `%${query.search.trim()}%`,
      });
    if (query.categoryId)
      builder.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    if (query.minPrice !== undefined)
      builder.andWhere('product.price >= :minPrice', {
        minPrice: query.minPrice,
      });
    if (query.maxPrice !== undefined)
      builder.andWhere('product.price <= :maxPrice', {
        maxPrice: query.maxPrice,
      });
    return builder;
  }

  private applySort(
    builder: SelectQueryBuilder<Product>,
    sort: ProductSort,
  ): SelectQueryBuilder<Product> {
    if (sort === ProductSort.PRICE_ASC) builder.orderBy('product.price', 'ASC');
    else if (sort === ProductSort.PRICE_DESC)
      builder.orderBy('product.price', 'DESC');
    else builder.orderBy('product.createdAt', 'DESC');
    return builder.addOrderBy('product.id', 'ASC');
  }

  /**
   * Rating order needs an aggregate join, and TypeORM's skip/take pagination wraps
   * joined queries in a DISTINCT subquery that cannot order by a derived column.
   * Paging over ids with a raw LIMIT sidesteps that, then the entities load by id.
   */
  private async pageByRating(query: ListProductsDto): Promise<Product[]> {
    const rows = await this.applyFilters(
      this.products.createQueryBuilder('product'),
      query,
    )
      .leftJoin(
        (sub) =>
          sub
            .select('review.product_id', 'product_id')
            .addSelect('AVG(review.rating)', 'average_rating')
            .from(Review, 'review')
            .groupBy('review.product_id'),
        'rating',
        'rating.product_id = product.id',
      )
      .select('product.id', 'id')
      // Unrated products land last because MySQL sorts NULL last on DESC.
      .orderBy('rating.average_rating', 'DESC')
      .addOrderBy('product.id', 'ASC')
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .getRawMany<{ id: string }>();
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const products = await this.products.find({
      where: { id: In(ids) },
      relations: { category: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    return ids
      .map((id) => byId.get(id))
      .filter((product): product is Product => Boolean(product));
  }

  private async attachRatings(products: Product[]): Promise<Product[]> {
    if (!products.length) return products;
    const rows = await this.reviews
      .createQueryBuilder('review')
      .select('review.product_id', 'productId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(review.rating)', 'sum')
      .where('review.product_id IN (:...ids)', {
        ids: products.map((product) => product.id),
      })
      .groupBy('review.product_id')
      .getRawMany<{ productId: string; count: string; sum: string }>();
    const summaries = ratingSummaries(rows);
    for (const product of products) {
      const summary = summaries[product.id] ?? emptyRatingAggregate();
      product.averageRating = summary.averageRating;
      product.reviewCount = summary.reviewCount;
    }
    return products;
  }

  private async category(id: string): Promise<Category> {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }
}
