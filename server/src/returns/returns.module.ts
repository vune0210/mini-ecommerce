import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrderStatusHistory } from '../orders/entities/order-status-history.entity';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { ReturnRequestItem } from './entities/return-request-item.entity';
import { ReturnRequest } from './entities/return-request.entity';
import { ReturnStatusHistory } from './entities/return-status-history.entity';
import {
  AdminReturnsController,
  ReturnsController,
} from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [
    // For StockMovementsService: a received return writes the ledger entry in
    // the same transaction as the stock it puts back.
    InventoryModule,
    TypeOrmModule.forFeature([
      ReturnRequest,
      ReturnRequestItem,
      ReturnStatusHistory,
      // Read-only here: the order and its lines are the evidence a return is
      // checked against, and order_status_history is where "when was this
      // completed" — the start of the return window — actually lives.
      Order,
      OrderItem,
      OrderStatusHistory,
      Product,
    ]),
  ],
  controllers: [ReturnsController, AdminReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
