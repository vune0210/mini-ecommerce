import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { CheckoutDto } from './dto/checkout.dto';
import { ListAdminOrdersDto, ListOrdersDto } from './dto/list-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Post('checkout') checkout(
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: CheckoutDto,
  ) {
    return this.orders.checkout(request.user.id, dto);
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
  ) {
    return this.orders.updateStatus(id, dto);
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
  ) {
    return this.orders.cancel(id, request.user.id);
  }
}
