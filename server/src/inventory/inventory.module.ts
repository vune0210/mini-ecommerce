import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { Product } from '../products/entities/product.entity';
import { StockAlert } from './entities/stock-alert.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { InventoryController } from './inventory.controller';
import { StockAlertsController } from './stock-alerts.controller';
import { StockAlertsService } from './stock-alerts.service';
import { StockMovementsService } from './stock-movements.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockMovement, StockAlert, Product]),
    NotificationsModule,
  ],
  controllers: [InventoryController, StockAlertsController],
  // Orders (sale, cancellation), Returns (received) and Products (manual
  // adjustment) all write to the ledger, always inside their own transaction.
  // The back-in-stock sweep hangs off that same write, so no caller has to
  // remember it.
  providers: [StockMovementsService, StockAlertsService],
  exports: [StockMovementsService, StockAlertsService],
})
export class InventoryModule {}
