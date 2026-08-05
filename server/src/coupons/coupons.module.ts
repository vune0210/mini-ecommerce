import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart } from '../cart/entities/cart.entity';
import {
  AdminCouponsController,
  CouponsController,
} from './coupons.controller';
import { CouponsService } from './coupons.service';
import { CouponRedemption } from './entities/coupon-redemption.entity';
import { Coupon } from './entities/coupon.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Coupon, CouponRedemption, Cart])],
  controllers: [CouponsController, AdminCouponsController],
  providers: [CouponsService],
  // OrdersModule spends and releases coupons inside the checkout transaction.
  exports: [CouponsService],
})
export class CouponsModule {}
