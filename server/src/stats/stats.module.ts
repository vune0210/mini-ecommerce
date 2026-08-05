import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import { CouponRedemption } from '../coupons/entities/coupon-redemption.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Product,
      User,
      Category,
      CouponRedemption,
    ]),
  ],
  controllers: [StatsController, ExportsController],
  providers: [StatsService, ExportsService],
})
export class StatsModule {}
