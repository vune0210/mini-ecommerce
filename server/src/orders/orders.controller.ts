import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { normalizeIdempotencyKey } from '../common/idempotency/idempotency-rules';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { ListAdminOrdersDto, ListOrdersDto } from './dto/list-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('checkout')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Optional client-generated key, 8-128 chars of [A-Za-z0-9._:-]. Retrying with the same key and the same body replays the original order instead of placing a second one. Reusing it with a different body is a 409, and so is a retry that arrives while the first is still running.',
  })
  checkout(
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // Opt-in: a caller that sends no key runs exactly as it always did, so the
    // header can be adopted client by client rather than in one flag day.
    return this.idempotency.run(
      request.user.id,
      'orders.checkout',
      normalizeIdempotencyKey(idempotencyKey),
      dto,
      () => this.orders.checkout(request.user, dto),
    );
  }
  @Get() list(
    @Request() request: { user: AuthenticatedUser },
    @Query() query: ListOrdersDto,
  ) {
    return this.orders.findMine(request.user.id, query);
  }
  @Get('admin/all') @UseGuards(RolesGuard) @Roles(UserRole.ADMIN) all(
    @Query() query: ListAdminOrdersDto,
  ) {
    return this.orders.findAll(query);
  }
  @Patch(':id/status') @UseGuards(RolesGuard) @Roles(UserRole.ADMIN) status(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Request() request: { user: AuthenticatedUser },
  ) {
    return this.orders.updateStatus(id, dto, request.user);
  }
  @Get(':id/history')
  @ApiOkResponse({
    description:
      'Status-history events for the order, oldest first. A null fromStatus marks the creation event. The actor is exposed as role + display name; actorId is non-null only for admin viewers.',
  })
  history(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ) {
    return this.orders.history(id, request.user);
  }
  @Get(':id') detail(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ) {
    return this.orders.findOne(id, request.user);
  }
  @Patch(':id/cancel') cancel(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancel(id, request.user, dto);
  }
}
