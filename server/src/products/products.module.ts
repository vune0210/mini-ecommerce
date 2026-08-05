import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesModule } from '../categories/categories.module';
import { Category } from '../categories/entities/category.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { Review } from '../reviews/entities/review.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductTagLink } from './entities/product-tag-link.entity';
import { ProductTag } from './entities/product-tag.entity';
import { Product } from './entities/product.entity';
import { ProductImagesController } from './product-images.controller';
import { ProductImagesService } from './product-images.service';
import {
  ProductTagsController,
  TagsController,
} from './product-tags.controller';
import { ProductTagsService } from './product-tags.service';
import {
  AdminProductsController,
  ProductsController,
} from './products.controller';
import { ProductsService } from './products.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Category,
      Review,
      ProductImage,
      ProductTag,
      ProductTagLink,
    ]),
    // CategoriesService resolves the descendant scope for category filters.
    CategoriesModule,
    InventoryModule,
  ],
  // TagsController is mounted at /tags rather than under /products: the tag
  // vocabulary is catalogue-wide, but it belongs to this module because the
  // only thing tags describe is products.
  controllers: [
    ProductsController,
    AdminProductsController,
    ProductImagesController,
    TagsController,
    ProductTagsController,
  ],
  providers: [ProductsService, ProductImagesService, ProductTagsService],
})
export class ProductsModule {}
