import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Request() request: { user: AuthenticatedUser }) {
    return this.cartService.getCart(request.user.id);
  }

  @Post('items')
  addItem(
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addItem(request.user.id, dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @Request() request: { user: AuthenticatedUser },
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(request.user.id, itemId, dto);
  }

  @Delete('items/:itemId')
  removeItem(
    @Request() request: { user: AuthenticatedUser },
    @Param('itemId') itemId: string,
  ) {
    return this.cartService.removeItem(request.user.id, itemId);
  }
}
