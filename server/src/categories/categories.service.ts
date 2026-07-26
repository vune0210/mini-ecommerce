import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.categories.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (await this.categories.findOneBy({ slug: dto.slug }))
      throw new ConflictException('Category slug already exists');
    return this.categories.save(
      this.categories.create({ name: dto.name.trim(), slug: dto.slug }),
    );
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);
    if (
      dto.slug &&
      dto.slug !== category.slug &&
      (await this.categories.findOneBy({ slug: dto.slug }))
    ) {
      throw new ConflictException('Category slug already exists');
    }
    Object.assign(
      category,
      dto.name ? { name: dto.name.trim() } : {},
      dto.slug ? { slug: dto.slug } : {},
    );
    return this.categories.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
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
}
