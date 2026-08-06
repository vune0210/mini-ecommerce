import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '../addresses/entities/address.entity';
import { CartItem } from '../cart/entities/cart-item.entity';
import { Cart } from '../cart/entities/cart.entity';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { CouponsModule } from '../coupons/coupons.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Product } from '../products/entities/product.entity';
import { PaymentsModule } from '../payments/payments.module';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { Order } from './entities/order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
@Module({
  imports: [
    ConfigModule,
    CouponsModule,
    IdempotencyModule,
    InventoryModule,
    NotificationsModule,
    PaymentsModule,
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      OrderStatusHistory,
      Cart,
      CartItem,
      Product,
      Address,
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
