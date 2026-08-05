import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartModule } from '../cart/cart.module';
import { Product } from '../products/entities/product.entity';
import { WishlistItem } from './entities/wishlist-item.entity';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [TypeOrmModule.forFeature([WishlistItem, Product]), CartModule],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
