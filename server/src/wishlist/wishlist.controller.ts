import {
  Body,
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
import { CartResponse } from '../cart/cart.service';
import { AddWishlistItemDto, MoveToCartDto } from './dto/add-wishlist-item.dto';
import { WishlistEntry, WishlistService } from './wishlist.service';

@ApiTags('wishlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @ApiOkResponse({ description: 'Saved products, most recently added first.' })
  list(
    @Request() request: { user: AuthenticatedUser },
  ): Promise<WishlistEntry[]> {
    return this.wishlist.list(request.user.id);
  }

  @Post()
  @ApiOkResponse({
    description:
      'Saves a product and returns the whole list. Idempotent — saving twice is not an error.',
  })
  add(
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: AddWishlistItemDto,
  ): Promise<WishlistEntry[]> {
    return this.wishlist.add(request.user.id, dto.productId);
  }

  @Post(':productId/move-to-cart')
  @ApiOkResponse({
    description:
      'Adds the saved product to the cart and unsaves it. Returns the updated cart; a stock failure leaves the product on the wishlist.',
  })
  moveToCart(
    @Request() request: { user: AuthenticatedUser },
    @Param('productId') productId: string,
    @Body() dto: MoveToCartDto,
  ): Promise<CartResponse> {
    return this.wishlist.moveToCart(request.user.id, productId, dto.quantity);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Request() request: { user: AuthenticatedUser },
    @Param('productId') productId: string,
  ): Promise<void> {
    await this.wishlist.remove(request.user.id, productId);
  }
}
