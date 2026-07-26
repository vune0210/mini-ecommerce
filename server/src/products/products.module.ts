import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import { Review } from '../reviews/entities/review.entity';
import { Product } from './entities/product.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
@Module({
  imports: [TypeOrmModule.forFeature([Product, Category, Review])],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
