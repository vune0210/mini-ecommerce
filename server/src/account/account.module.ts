import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '../addresses/entities/address.entity';
import { StockAlert } from '../inventory/entities/stock-alert.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { Review } from '../reviews/entities/review.entity';
import { WishlistItem } from '../wishlist/entities/wishlist-item.entity';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

/**
 * Read-only, and deliberately so: this module answers "what does my account
 * look like" by counting rows other modules own. It registers their entities
 * for querying but never writes to them, which is why it can import the
 * entities directly instead of the modules.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Review,
      WishlistItem,
      Address,
      StockAlert,
    ]),
  ],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
