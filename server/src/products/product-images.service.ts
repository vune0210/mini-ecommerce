import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { ReorderProductImagesDto } from './dto/reorder-product-images.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { ProductImage } from './entities/product-image.entity';
import { Product } from './entities/product.entity';
import {
  moveToPosition,
  nextGalleryPosition,
  primaryImageUrl,
  renumberPositions,
  resolvePrimaryImageId,
  sortGallery,
} from './product-media-rules';

@Injectable()
export class ProductImagesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ProductImage)
    private readonly images: Repository<ProductImage>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  /**
   * The gallery in display order. `visibleOnly` mirrors ProductsService.findOne:
   * an unpublished product is a 404 here too, or its pictures would stay
   * reachable through a route that never learned about unpublishing.
   */
  async list(productId: string, visibleOnly = true): Promise<ProductImage[]> {
    await this.assertProduct(productId, visibleOnly);
    return sortGallery(await this.images.findBy({ productId }));
  }

  /** Galleries for a set of products in one query, never one query per product. */
  async galleriesFor(
    productIds: readonly string[],
  ): Promise<Map<string, ProductImage[]>> {
    const galleries = new Map<string, ProductImage[]>();
    if (!productIds.length) return galleries;
    const rows = await this.images.findBy({ productId: In([...productIds]) });
    for (const image of rows) {
      const gallery = galleries.get(image.productId) ?? [];
      gallery.push(image);
      galleries.set(image.productId, gallery);
    }
    for (const [productId, gallery] of galleries)
      galleries.set(productId, sortGallery(gallery));
    return galleries;
  }

  async add(
    productId: string,
    dto: CreateProductImageDto,
  ): Promise<ProductImage> {
    return this.dataSource.transaction(async (manager) => {
      await this.assertProduct(productId, false, manager);
      const repository = manager.getRepository(ProductImage);
      const existing = await repository.findBy({ productId });
      const created = await repository.save(
        repository.create({
          productId,
          url: dto.url.trim(),
          altText: dto.altText?.trim() || null,
          position: nextGalleryPosition(existing),
          // The first picture is promoted whether or not the caller asked: a
          // gallery with no primary leaves products.image_url null, which every
          // client still reading the legacy field renders as no image at all.
          isPrimary: dto.isPrimary === true || existing.length === 0,
        }),
      );
      const settled = await this.settle(manager, productId, {
        order:
          dto.position === undefined
            ? undefined
            : moveToPosition([...existing, created], created.id, dto.position),
        primaryId: dto.isPrimary === true ? created.id : undefined,
      });
      return this.pick(settled, created.id);
    });
  }

  async update(
    productId: string,
    imageId: string,
    dto: UpdateProductImageDto,
  ): Promise<ProductImage> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductImage);
      // Scoped by product id as well as image id: an image of another product
      // is a 404, not a silent cross-product edit.
      const image = await repository.findOneBy({ id: imageId, productId });
      if (!image) throw new NotFoundException('Product image not found');
      if (dto.altText !== undefined) {
        image.altText = dto.altText?.trim() || null;
        await repository.save(image);
      }
      const siblings = await repository.findBy({ productId });
      const settled = await this.settle(manager, productId, {
        order:
          dto.position === undefined
            ? undefined
            : moveToPosition(siblings, imageId, dto.position),
        // Only promotion acts. Accepting `isPrimary: false` would leave the
        // product with no thumbnail; callers promote another image instead.
        primaryId: dto.isPrimary === true ? imageId : undefined,
      });
      return this.pick(settled, imageId);
    });
  }

  async remove(productId: string, imageId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductImage);
      const image = await repository.findOneBy({ id: imageId, productId });
      if (!image) throw new NotFoundException('Product image not found');
      await repository.remove(image);
      // Deleting the primary promotes the next picture rather than leaving the
      // product without one; settle re-elects and rewrites products.image_url.
      await this.settle(manager, productId);
    });
  }

  /**
   * Reorders the whole gallery in one request. A per-image PATCH loop would
   * leave the gallery in an order nobody asked for between calls, and a failed
   * call halfway through would strand it there.
   */
  async reorder(
    productId: string,
    dto: ReorderProductImagesDto,
  ): Promise<ProductImage[]> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductImage);
      const images = await repository.findBy({ productId });
      if (!images.length) await this.assertProduct(productId, false, manager);
      const known = new Set(images.map((image) => image.id));
      const strays = dto.imageIds.filter((id) => !known.has(id));
      // Refused rather than ignored: an id belonging to another product almost
      // always means the client posted the wrong gallery, and quietly
      // reordering the rest would hide that until someone noticed the pictures.
      if (strays.length)
        throw new BadRequestException(
          `Not images of this product: ${strays.join(', ')}`,
        );
      return this.settle(manager, productId, { order: dto.imageIds });
    });
  }

  /**
   * The single exit from every mutation: positions renumbered to a dense
   * 0..n-1, exactly one primary, and that primary mirrored into the legacy
   * `products.image_url`. Centralised because the invariants are only worth
   * anything if they hold after *every* write — five copies of this logic would
   * hold after four of them.
   */
  private async settle(
    manager: EntityManager,
    productId: string,
    options: { order?: readonly string[]; primaryId?: string | null } = {},
  ): Promise<ProductImage[]> {
    const repository = manager.getRepository(ProductImage);
    const images = await repository.findBy({ productId });
    const positions = new Map(
      renumberPositions(images, options.order ?? []).map((entry) => [
        entry.id,
        entry.position,
      ]),
    );
    const primaryId = resolvePrimaryImageId(images, options.primaryId);
    for (const image of images) {
      const position = positions.get(image.id) ?? image.position;
      const isPrimary = image.id === primaryId;
      if (image.position === position && image.isPrimary === isPrimary)
        continue;
      image.position = position;
      image.isPrimary = isPrimary;
      await repository.save(image);
    }
    // The legacy field is a mirror, not a second source of truth: a storefront
    // still reading image_url must see the same picture the gallery calls
    // primary, and an emptied gallery must clear it rather than keep serving a
    // photo the admin just deleted.
    await manager
      .getRepository(Product)
      .update({ id: productId }, { imageUrl: primaryImageUrl(images) });
    return sortGallery(images);
  }

  private async assertProduct(
    productId: string,
    visibleOnly: boolean,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(Product) : this.products;
    const found = await repository.countBy({
      id: productId,
      ...(visibleOnly ? { isActive: true } : {}),
    });
    if (!found) throw new NotFoundException('Product not found');
  }

  private pick(images: ProductImage[], id: string): ProductImage {
    const image = images.find((candidate) => candidate.id === id);
    if (!image) throw new NotFoundException('Product image not found');
    return image;
  }
}
