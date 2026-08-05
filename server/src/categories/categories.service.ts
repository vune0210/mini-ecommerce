import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import {
  buildCategoryTree,
  CategoryNode,
  descendantIdsOf,
  wouldCreateCycle,
} from './category-rules';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  /**
   * Flat list with a published-product count on each row. Counting only active
   * products keeps the number honest: a category showing "12" that renders an
   * empty page is worse than showing "0".
   */
  async findAll(): Promise<Category[]> {
    const categories = await this.categories.find({ order: { name: 'ASC' } });
    return this.attachCounts(categories);
  }

  async tree(): Promise<CategoryNode<Category>[]> {
    return buildCategoryTree(await this.findAll());
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    return (await this.attachCounts([category]))[0];
  }

  /** The category and everything under it — the scope a listing filter uses. */
  async descendantIds(id: string): Promise<string[]> {
    const all = await this.categories.find({
      select: { id: true, parentId: true },
    });
    return descendantIdsOf(all, id);
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (await this.categories.findOneBy({ slug: dto.slug }))
      throw new ConflictException('Category slug already exists');
    if (dto.parentId) await this.assertExists(dto.parentId);
    return this.categories.save(
      this.categories.create({
        name: dto.name.trim(),
        slug: dto.slug,
        parentId: dto.parentId ?? null,
      }),
    );
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    if (
      dto.slug &&
      dto.slug !== category.slug &&
      (await this.categories.findOneBy({ slug: dto.slug }))
    ) {
      throw new ConflictException('Category slug already exists');
    }
    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.assertExists(dto.parentId);
      const all = await this.categories.find({
        select: { id: true, parentId: true },
      });
      // Moving a category under its own descendant detaches that whole branch
      // from the root, where nothing would ever list it again.
      if (wouldCreateCycle(all, id, dto.parentId))
        throw new BadRequestException(
          'A category cannot be nested inside itself',
        );
    }
    Object.assign(
      category,
      dto.name ? { name: dto.name.trim() } : {},
      dto.slug ? { slug: dto.slug } : {},
      dto.parentId !== undefined ? { parentId: dto.parentId ?? null } : {},
    );
    await this.categories.save(category);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    // Checked before the delete so the message names the actual obstacle;
    // parent_id is ON DELETE RESTRICT, which would otherwise surface as the
    // same generic foreign-key error products do.
    if (await this.categories.countBy({ parentId: id }))
      throw new ConflictException(
        'Category still has subcategories and cannot be deleted',
      );
    try {
      await this.categories.remove(category);
    } catch (error) {
      // products.category_id is ON DELETE RESTRICT, so a category that still
      // holds products cannot be deleted. ProductsService.remove already maps
      // this code; without the same handling here it surfaced as a raw 500.
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code ===
          'ER_ROW_IS_REFERENCED_2'
      )
        throw new ConflictException(
          'Category still has products and cannot be deleted',
        );
      throw error;
    }
  }

  private async assertExists(id: string): Promise<void> {
    if (!(await this.categories.findOneBy({ id })))
      throw new NotFoundException('Parent category not found');
  }

  /** One grouped query for the whole page, never one count per category. */
  private async attachCounts(categories: Category[]): Promise<Category[]> {
    if (!categories.length) return categories;
    const rows = await this.products
      .createQueryBuilder('product')
      .select('product.category_id', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .where('product.category_id IN (:...ids)', {
        ids: categories.map((category) => category.id),
      })
      .andWhere('product.is_active = :active', { active: true })
      .groupBy('product.category_id')
      .getRawMany<{ categoryId: string; count: string }>();
    const counts = new Map(
      rows.map((row) => [row.categoryId, Number(row.count)]),
    );
    for (const category of categories)
      category.productCount = counts.get(category.id) ?? 0;
    return categories;
  }
}
