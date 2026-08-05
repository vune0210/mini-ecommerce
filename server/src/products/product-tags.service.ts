import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CreateTagDto } from './dto/create-tag.dto';
import { SetProductTagsDto } from './dto/set-product-tags.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { ProductTagLink } from './entities/product-tag-link.entity';
import { ProductTag } from './entities/product-tag.entity';
import { Product } from './entities/product.entity';
import { diffTagIds, normalizeTagSlug } from './product-media-rules';

@Injectable()
export class ProductTagsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ProductTag)
    private readonly tags: Repository<ProductTag>,
    @InjectRepository(ProductTagLink)
    private readonly links: Repository<ProductTagLink>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  /**
   * Every tag with the number of published products behind it. Counting only
   * published ones for the same reason categories do: a chip promising "12"
   * that opens an empty page is worse than a chip saying "0".
   */
  async findAll(): Promise<ProductTag[]> {
    const tags = await this.tags.find({ order: { name: 'ASC' } });
    return this.attachCounts(tags);
  }

  async create(dto: CreateTagDto): Promise<ProductTag> {
    const name = dto.name.trim();
    const slug = this.slugOrFail(dto.slug ?? name);
    if (await this.tags.findOneBy({ slug }))
      throw new ConflictException('Tag slug already exists');
    const created = await this.tags.save(this.tags.create({ name, slug }));
    created.productCount = 0;
    return created;
  }

  async update(id: string, dto: UpdateTagDto): Promise<ProductTag> {
    const tag = await this.tags.findOneBy({ id });
    if (!tag) throw new NotFoundException('Tag not found');
    // A rename does not re-slug. The slug is what storefront links and saved
    // filters point at, so fixing a typo in the label must not break them; an
    // admin who wants the URL changed too says so explicitly.
    if (dto.slug !== undefined) {
      const slug = this.slugOrFail(dto.slug);
      if (slug !== tag.slug && (await this.tags.findOneBy({ slug })))
        throw new ConflictException('Tag slug already exists');
      tag.slug = slug;
    }
    if (dto.name !== undefined) tag.name = dto.name.trim();
    await this.tags.save(tag);
    return (await this.attachCounts([tag]))[0];
  }

  /** The links CASCADE away: a tag is a label, so deleting it unlabels products. */
  async remove(id: string): Promise<void> {
    const tag = await this.tags.findOneBy({ id });
    if (!tag) throw new NotFoundException('Tag not found');
    await this.tags.remove(tag);
  }

  /** The labels on a set of products, in one query rather than one per product. */
  async tagsForProducts(
    productIds: readonly string[],
  ): Promise<Map<string, ProductTag[]>> {
    const byProduct = new Map<string, ProductTag[]>();
    if (!productIds.length) return byProduct;
    const links = await this.links.find({
      where: { productId: In([...productIds]) },
      relations: { tag: true },
    });
    for (const link of links) {
      const tags = byProduct.get(link.productId) ?? [];
      tags.push(link.tag);
      byProduct.set(link.productId, tags);
    }
    for (const tags of byProduct.values()) this.sortByName(tags);
    return byProduct;
  }

  /**
   * Replaces a product's whole tag set. Only the difference is written: a
   * blanket delete-then-insert would reset created_at on every surviving link,
   * erasing the only record of when a product actually picked up a label.
   */
  async setProductTags(
    productId: string,
    dto: SetProductTagsDto,
  ): Promise<ProductTag[]> {
    return this.dataSource.transaction(async (manager) => {
      if (!(await manager.getRepository(Product).countBy({ id: productId })))
        throw new NotFoundException('Product not found');
      const desired = [...new Set(dto.tagIds)];
      const tags = desired.length
        ? await manager.getRepository(ProductTag).findBy({ id: In(desired) })
        : [];
      // Reported rather than skipped: half-applying a "replace the set" request
      // leaves the caller believing in tags the product does not have.
      const missing = desired.filter(
        (id) => !tags.some((tag) => tag.id === id),
      );
      if (missing.length)
        throw new NotFoundException(`Unknown tag ids: ${missing.join(', ')}`);
      const linkRepository = manager.getRepository(ProductTagLink);
      const current = await linkRepository.findBy({ productId });
      const { added, removed } = diffTagIds(
        current.map((link) => link.tagId),
        desired,
      );
      if (removed.length)
        await linkRepository.delete({ productId, tagId: In(removed) });
      if (added.length)
        await linkRepository.save(
          added.map((tagId) => linkRepository.create({ productId, tagId })),
        );
      return this.sortByName(tags);
    });
  }

  /** Empty after normalization means the label was punctuation or emoji only. */
  private slugOrFail(source: string): string {
    const slug = normalizeTagSlug(source);
    if (!slug)
      throw new BadRequestException(
        'Tag name must contain at least one letter or digit',
      );
    return slug;
  }

  private sortByName(tags: ProductTag[]): ProductTag[] {
    return tags.sort((left, right) => left.name.localeCompare(right.name));
  }

  /** One grouped query for the whole list, never one count per tag. */
  private async attachCounts(tags: ProductTag[]): Promise<ProductTag[]> {
    if (!tags.length) return tags;
    const rows = await this.links
      .createQueryBuilder('link')
      .select('link.tag_id', 'tagId')
      .addSelect('COUNT(*)', 'count')
      .innerJoin(Product, 'product', 'product.id = link.product_id')
      .where('link.tag_id IN (:...ids)', { ids: tags.map((tag) => tag.id) })
      .andWhere('product.is_active = :active', { active: true })
      .groupBy('link.tag_id')
      .getRawMany<{ tagId: string; count: string }>();
    const counts = new Map(rows.map((row) => [row.tagId, Number(row.count)]));
    for (const tag of tags) tag.productCount = counts.get(tag.id) ?? 0;
    return tags;
  }
}
