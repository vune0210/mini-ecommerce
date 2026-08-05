import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  Not,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { CategoriesService } from '../categories/categories.service';
import { Category } from '../categories/entities/category.entity';
import { AdjustStockDto } from '../inventory/dto/adjust-stock.dto';
import { StockMovementReason } from '../inventory/entities/stock-movement.entity';
import { StockMovementsService } from '../inventory/stock-movements.service';
import { Review } from '../reviews/entities/review.entity';
import { emptyRatingAggregate, ratingSummaries } from '../reviews/review-rules';
import { adjustedPrice, normalizeSuggestQuery, uniqueIds } from './bulk-rules';
import {
  BulkCategoryDto,
  BulkPriceDto,
  BulkResultDto,
  BulkVisibilityDto,
} from './dto/bulk-products.dto';
import { CreateProductDto } from './dto/create-product.dto';
import {
  ListAdminProductsDto,
  ListProductsDto,
  ProductSort,
} from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';
import { ProductImagesService } from './product-images.service';
import { parseTagSlugs } from './product-media-rules';
import { ProductTagsService } from './product-tags.service';

export type PaginatedProducts = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};

/** How many suggestions `/products/:id/related` returns. */
const RELATED_LIMIT = 8;

/** A typeahead dropdown that needs scrolling has already failed. */
const SUGGEST_LIMIT = 8;

/** The narrow projection a search dropdown actually renders. */
export type Suggestion = {
  id: string;
  name: string;
  slug: string;
  price: string;
  imageUrl: string | null;
  stock: number;
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    private readonly categoryTree: CategoriesService,
    private readonly stockMovements: StockMovementsService,
    private readonly productImages: ProductImagesService,
    private readonly productTags: ProductTagsService,
  ) {}

  /**
   * The storefront listing. `visibleOnly` is a parameter rather than a query
   * flag so no crafted URL can surface an unpublished product — only the
   * admin-guarded controller passes false.
   */
  async findAll(
    query: ListProductsDto,
    visibleOnly = true,
  ): Promise<PaginatedProducts> {
    const categoryIds = await this.categoryScope(query);
    // A rating sort or a rating floor both need the aggregate join, and that
    // changes how the page *and* the total have to be computed — the plain
    // count would include products the rating filter then drops.
    if (this.needsRatingJoin(query)) {
      const [items, total] = await Promise.all([
        this.pageByRating(query, visibleOnly, categoryIds),
        this.countByRating(query, visibleOnly, categoryIds),
      ]);
      return {
        items: await this.attachRatings(items),
        total,
        page: query.page,
        limit: query.limit,
      };
    }
    const builder = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category');
    this.applyFilters(builder, query, visibleOnly, categoryIds);
    const total = await builder.getCount();
    const items = await this.applySort(builder, query.sort)
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

  findAllForAdmin(query: ListAdminProductsDto): Promise<PaginatedProducts> {
    return this.findAll(query, false);
  }

  /**
   * Public detail. An unpublished product is a 404, not a 403: confirming that
   * an id exists but is hidden is exactly the leak unpublishing exists to close.
   */
  async findOne(id: string, visibleOnly = true): Promise<Product> {
    const product = await this.products.findOne({
      where: { id, ...(visibleOnly ? { isActive: true } : {}) },
      relations: { category: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.attachMedia((await this.attachRatings([product]))[0]);
  }

  async findBySlug(slug: string, visibleOnly = true): Promise<Product> {
    const product = await this.products.findOne({
      where: { slug, ...(visibleOnly ? { isActive: true } : {}) },
      relations: { category: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.attachMedia((await this.attachRatings([product]))[0]);
  }

  /**
   * Same-category suggestions, best rated first. Deliberately not a
   * "customers also bought" query: with this data volume co-purchase
   * suggestions are noise, and a wrong recommendation is worse than an obvious
   * one. Out-of-stock products are excluded — there is no point suggesting
   * something that cannot be bought.
   */
  async findRelated(id: string, limit = RELATED_LIMIT): Promise<Product[]> {
    const product = await this.findOne(id);
    const rows = await this.products.find({
      where: {
        categoryId: product.categoryId,
        id: Not(product.id),
        isActive: true,
      },
      relations: { category: true },
      take: limit,
    });
    const withRatings = await this.attachRatings(rows);
    return withRatings
      .filter((candidate) => candidate.stock > 0)
      .sort(
        (left, right) => (right.averageRating ?? 0) - (left.averageRating ?? 0),
      );
  }

  /**
   * Typeahead suggestions. Published products only, ordered so that a name
   * starting with the term outranks one merely containing it — typing "tai"
   * should surface "Tai nghe" above "Bàn phím tai thỏ", which a plain LIKE
   * cannot express.
   *
   * Returns a narrow projection rather than whole products: a dropdown needs a
   * name, a price and a thumbnail, and shipping the description of eight
   * products on every keystroke is the difference between a snappy box and a
   * sluggish one.
   */
  async suggest(
    rawQuery: unknown,
    limit = SUGGEST_LIMIT,
  ): Promise<Suggestion[]> {
    const term = normalizeSuggestQuery(rawQuery);
    if (!term) return [];
    return this.products
      .createQueryBuilder('product')
      .select([
        'product.id AS id',
        'product.name AS name',
        'product.slug AS slug',
        'product.price AS price',
        'product.image_url AS imageUrl',
        'product.stock AS stock',
      ])
      .where('product.is_active = :active', { active: true })
      .andWhere(
        '(LOWER(product.name) LIKE LOWER(:contains) OR LOWER(product.sku) LIKE LOWER(:contains))',
        { contains: `%${term}%` },
      )
      .orderBy(
        'CASE WHEN LOWER(product.name) LIKE LOWER(:starts) THEN 0 ELSE 1 END',
        'ASC',
      )
      .addOrderBy('product.name', 'ASC')
      .setParameter('starts', `${term}%`)
      .limit(limit)
      .getRawMany<Suggestion>();
  }

  async create(dto: CreateProductDto): Promise<Product> {
    if (await this.products.findOneBy({ slug: dto.slug }))
      throw new ConflictException('Product slug already exists');
    if (dto.sku && (await this.products.findOneBy({ sku: dto.sku })))
      throw new ConflictException('Product SKU already exists');
    const category = await this.category(dto.categoryId);
    return this.products.save(
      this.products.create({
        ...dto,
        name: dto.name.trim(),
        description: dto.description.trim(),
        category,
        imageUrl: dto.imageUrl ?? null,
        sku: dto.sku ?? null,
        isActive: dto.isActive ?? true,
        price: dto.price.toFixed(2),
      }),
    );
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id, false);
    if (
      dto.slug &&
      dto.slug !== product.slug &&
      (await this.products.findOneBy({ slug: dto.slug }))
    )
      throw new ConflictException('Product slug already exists');
    if (
      dto.sku &&
      dto.sku !== product.sku &&
      (await this.products.findOneBy({ sku: dto.sku }))
    )
      throw new ConflictException('Product SKU already exists');
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
      // Stock is writable here for backwards compatibility, but PATCH
      // /products/:id/stock is the path that leaves an audit trail.
      dto.stock !== undefined ? { stock: dto.stock } : {},
      dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {},
      dto.sku !== undefined ? { sku: dto.sku || null } : {},
      dto.isActive !== undefined ? { isActive: dto.isActive } : {},
    );
    return this.products.save(product);
  }

  /**
   * Sets stock to an absolute level and writes the ledger entry in the same
   * transaction. Absolute rather than a delta so that a retried request — the
   * classic double-submit — converges on the intended count instead of
   * applying the correction twice.
   */
  async adjustStock(
    id: string,
    dto: AdjustStockDto,
    actor: AuthenticatedUser,
  ): Promise<Product> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Product);
      // Locked for the same reason checkout locks: a concurrent order that
      // decrements between the read and the write would be silently erased by
      // an absolute set.
      const product = await repository
        .createQueryBuilder('product')
        .setLock('pessimistic_write')
        .where('product.id = :id', { id })
        .getOne();
      if (!product) throw new NotFoundException('Product not found');
      const delta = dto.stock - product.stock;
      product.stock = dto.stock;
      await repository.save(product);
      await this.stockMovements.record(manager, {
        productId: product.id,
        productName: product.name,
        delta,
        balanceAfter: product.stock,
        reason: dto.reason as unknown as StockMovementReason,
        actorUserId: actor.id,
        note: dto.note,
      });
      return product;
    });
  }

  /**
   * Publishes or unpublishes a selection in one statement. Ids that match no
   * product are reported rather than silently dropped: an admin who pasted a
   * stale id needs to know their selection was not what they thought.
   */
  async bulkVisibility(dto: BulkVisibilityDto): Promise<BulkResultDto> {
    const ids = uniqueIds(dto.productIds);
    const found = await this.products.find({
      where: { id: In(ids) },
      select: { id: true },
    });
    const foundIds = new Set(found.map((product) => product.id));
    if (foundIds.size)
      await this.products.update(
        { id: In([...foundIds]) },
        { isActive: dto.isActive },
      );
    return {
      updated: foundIds.size,
      skipped: ids
        .filter((id) => !foundIds.has(id))
        .map((productId) => ({ productId, reason: 'not-found' })),
    };
  }

  async bulkCategory(dto: BulkCategoryDto): Promise<BulkResultDto> {
    // Validated once, up front: moving a hundred products into a category that
    // does not exist should fail as a request, not as a hundred skips.
    await this.category(dto.categoryId);
    const ids = uniqueIds(dto.productIds);
    const found = await this.products.find({
      where: { id: In(ids) },
      select: { id: true },
    });
    const foundIds = new Set(found.map((product) => product.id));
    if (foundIds.size)
      await this.products.update(
        { id: In([...foundIds]) },
        { categoryId: dto.categoryId },
      );
    return {
      updated: foundIds.size,
      skipped: ids
        .filter((id) => !foundIds.has(id))
        .map((productId) => ({ productId, reason: 'not-found' })),
    };
  }

  /**
   * Re-prices a selection. Each product's new price is computed from its own
   * current price, which is why this cannot be a single UPDATE.
   *
   * A product whose result falls outside the representable range is skipped
   * and reported — the run is not aborted. That is the deliberate choice: a
   * single unlucky product should not block a legitimate catalogue-wide
   * change, and the caller is told exactly which ones did not move. The
   * transaction is here so the successful writes land together, not to make
   * the operation all-or-nothing.
   */
  async bulkPrice(dto: BulkPriceDto): Promise<BulkResultDto> {
    const ids = uniqueIds(dto.productIds);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Product);
      const products = await repository.find({ where: { id: In(ids) } });
      const byId = new Map(products.map((product) => [product.id, product]));
      const skipped: BulkResultDto['skipped'] = [];
      let updated = 0;

      for (const id of ids) {
        const product = byId.get(id);
        if (!product) {
          skipped.push({ productId: id, reason: 'not-found' });
          continue;
        }
        const outcome = adjustedPrice(product.price, dto.mode, dto.value);
        if (!outcome.ok) {
          skipped.push({ productId: id, reason: outcome.reason });
          continue;
        }
        product.price = outcome.price;
        await repository.save(product);
        updated += 1;
      }
      return { updated, skipped };
    });
  }

  async remove(id: string): Promise<void> {
    const product = await this.findOne(id, false);
    try {
      await this.products.remove(product);
    } catch (error) {
      // cart_items holds an ON DELETE RESTRICT reference, so a product sitting
      // in someone's cart cannot be deleted. Report that instead of a raw 500,
      // and point at unpublishing, which always works.
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code ===
          'ER_ROW_IS_REFERENCED_2'
      )
        throw new ConflictException(
          'Product is still referenced by a cart and cannot be deleted; unpublish it instead',
        );
      throw error;
    }
  }

  /**
   * Resolves `categoryId` into the set of categories a listing may draw from.
   * Returns null when there is no category filter at all, which keeps the
   * common case free of an IN clause.
   */
  private async categoryScope(
    query: ListProductsDto,
  ): Promise<string[] | null> {
    if (!query.categoryId) return null;
    if (!query.includeDescendants) return [query.categoryId];
    return this.categoryTree.descendantIds(query.categoryId);
  }

  private applyFilters(
    builder: SelectQueryBuilder<Product>,
    query: ListProductsDto,
    visibleOnly: boolean,
    categoryIds: string[] | null,
  ): SelectQueryBuilder<Product> {
    if (visibleOnly)
      builder.andWhere('product.isActive = :visible', { visible: true });
    else if ((query as ListAdminProductsDto).isActive !== undefined)
      builder.andWhere('product.isActive = :isActive', {
        isActive: (query as ListAdminProductsDto).isActive,
      });
    if (query.search)
      builder.andWhere(
        '(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.slug) LIKE LOWER(:search) OR LOWER(product.sku) LIKE LOWER(:search))',
        { search: `%${query.search.trim()}%` },
      );
    if (categoryIds)
      builder.andWhere('product.categoryId IN (:...categoryIds)', {
        categoryIds,
      });
    if (query.minPrice !== undefined)
      builder.andWhere('product.price >= :minPrice', {
        minPrice: query.minPrice,
      });
    if (query.maxPrice !== undefined)
      builder.andWhere('product.price <= :maxPrice', {
        maxPrice: query.maxPrice,
      });
    if (query.inStock) builder.andWhere('product.stock > 0');
    const tagSlugs = parseTagSlugs(query.tags);
    // A correlated COUNT rather than a join: joining the link table and
    // filtering `slug IN (...)` matches a product carrying *any* of the tags,
    // and the duplicated rows it produces would also corrupt the page count
    // above. Counting distinct matches inside the subquery is what makes this
    // an ALL filter, and it leaves the outer query one row per product.
    if (tagSlugs.length)
      builder.andWhere(
        `(SELECT COUNT(DISTINCT link.tag_id) FROM product_tag_links link
            INNER JOIN product_tags tag ON tag.id = link.tag_id
            WHERE link.product_id = product.id AND tag.slug IN (:...tagSlugs)) = :tagMatches`,
        { tagSlugs, tagMatches: tagSlugs.length },
      );
    return builder;
  }

  private applySort(
    builder: SelectQueryBuilder<Product>,
    sort: ProductSort,
  ): SelectQueryBuilder<Product> {
    if (sort === ProductSort.PRICE_ASC) builder.orderBy('product.price', 'ASC');
    else if (sort === ProductSort.PRICE_DESC)
      builder.orderBy('product.price', 'DESC');
    else if (sort === ProductSort.NAME_ASC)
      builder.orderBy('product.name', 'ASC');
    else builder.orderBy('product.createdAt', 'DESC');
    return builder.addOrderBy('product.id', 'ASC');
  }

  /** Both rating order and the rating floor need the aggregate join. */
  private needsRatingJoin(query: ListProductsDto): boolean {
    return (
      query.sort === ProductSort.RATING_DESC || query.minRating !== undefined
    );
  }

  /**
   * Rating order needs an aggregate join, and TypeORM's skip/take pagination wraps
   * joined queries in a DISTINCT subquery that cannot order by a derived column.
   * Paging over ids with a raw LIMIT sidesteps that, then the entities load by id.
   */
  private async pageByRating(
    query: ListProductsDto,
    visibleOnly: boolean,
    categoryIds: string[] | null,
  ): Promise<Product[]> {
    const rows = await this.ratingScopedQuery(query, visibleOnly, categoryIds)
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

  /**
   * `minRating` filters on an aggregate, so the total cannot come from the
   * plain builder — it would count products the page then drops and paginate
   * over a number the caller never sees.
   */
  private async countByRating(
    query: ListProductsDto,
    visibleOnly: boolean,
    categoryIds: string[] | null,
  ): Promise<number> {
    const rows = await this.ratingScopedQuery(query, visibleOnly, categoryIds)
      .select('COUNT(DISTINCT product.id)', 'total')
      .getRawOne<{ total: string }>();
    return Number(rows?.total ?? 0);
  }

  private ratingScopedQuery(
    query: ListProductsDto,
    visibleOnly: boolean,
    categoryIds: string[] | null,
  ): SelectQueryBuilder<Product> {
    const builder = this.applyFilters(
      this.products.createQueryBuilder('product'),
      query,
      visibleOnly,
      categoryIds,
    );
    builder.leftJoin(
      (sub) =>
        sub
          .select('review.product_id', 'product_id')
          .addSelect('AVG(review.rating)', 'average_rating')
          .from(Review, 'review')
          .where('review.is_hidden = :notHidden', { notHidden: false })
          .groupBy('review.product_id'),
      'rating',
      'rating.product_id = product.id',
    );
    if (query.minRating !== undefined)
      builder.andWhere('rating.average_rating >= :minRating', {
        minRating: query.minRating,
      });
    return builder;
  }

  /** Hidden reviews are moderated away, so they must not move the average. */
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
      .andWhere('review.is_hidden = :notHidden', { notHidden: false })
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

  /**
   * Detail responses carry the gallery and the labels. Listings deliberately do
   * not: a page of twelve products renders one thumbnail each, which the legacy
   * `imageUrl` already answers, so fanning out for pictures and tags nobody
   * shows would cost two extra queries per page for nothing.
   */
  private async attachMedia(product: Product): Promise<Product> {
    const [galleries, tags] = await Promise.all([
      this.productImages.galleriesFor([product.id]),
      this.productTags.tagsForProducts([product.id]),
    ]);
    product.images = galleries.get(product.id) ?? [];
    product.tags = tags.get(product.id) ?? [];
    return product;
  }

  private async category(id: string): Promise<Category> {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }
}
