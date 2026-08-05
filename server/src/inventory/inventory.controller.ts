import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { ListStockMovementsDto } from './dto/list-stock-movements.dto';
import {
  PaginatedStockMovements,
  StockMovementsService,
} from './stock-movements.service';

@ApiTags('admin-inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/stock-movements')
export class InventoryController {
  constructor(private readonly movements: StockMovementsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Append-only stock ledger, newest first. Filter by product, reason, and a UTC calendar-day range.',
  })
  list(
    @Query() query: ListStockMovementsDto,
  ): Promise<PaginatedStockMovements> {
    return this.movements.findAll(query);
  }
}
