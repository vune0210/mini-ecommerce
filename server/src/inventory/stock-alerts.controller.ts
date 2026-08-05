import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StockAlert } from './entities/stock-alert.entity';
import { StockAlertsService } from './stock-alerts.service';

@ApiTags('stock-alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class StockAlertsController {
  constructor(private readonly alerts: StockAlertsService) {}

  @Get('stock-alerts')
  @ApiOkResponse({
    description: 'Products the caller is waiting on, most recent first.',
  })
  list(@Request() request: { user: AuthenticatedUser }): Promise<StockAlert[]> {
    return this.alerts.list(request.user.id);
  }

  @Post('products/:productId/stock-alert')
  @ApiOkResponse({
    description:
      'Watch a sold-out product. Idempotent. Returns 400 for a product that is already in stock — the crossing it waits for has already happened.',
  })
  subscribe(
    @Request() request: { user: AuthenticatedUser },
    @Param('productId') productId: string,
  ): Promise<StockAlert[]> {
    return this.alerts.subscribe(request.user.id, productId);
  }

  @Delete('products/:productId/stock-alert')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Request() request: { user: AuthenticatedUser },
    @Param('productId') productId: string,
  ): Promise<void> {
    await this.alerts.unsubscribe(request.user.id, productId);
  }
}
