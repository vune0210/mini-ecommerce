import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { ReorderProductImagesDto } from './dto/reorder-product-images.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { ProductImage } from './entities/product-image.entity';
import { ProductImagesService } from './product-images.service';

@ApiTags('product-images')
@Controller('products/:productId/images')
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Get()
  @ApiOkResponse({
    description:
      'The gallery in display order. Exactly one entry carries isPrimary, and that entry is what the legacy products.imageUrl mirrors.',
  })
  list(@Param('productId') productId: string): Promise<ProductImage[]> {
    return this.images.list(productId);
  }

  // Declared ahead of the ':imageId' handlers so "order" is never read as an
  // id, matching how 'slug/:slug' is placed in ProductsController.
  @Put('order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      'Reorders the whole gallery in one call and returns it renumbered. Ids omitted from the list keep their relative order behind the ones sent.',
  })
  reorder(
    @Param('productId') productId: string,
    @Body() dto: ReorderProductImagesDto,
  ): Promise<ProductImage[]> {
    return this.images.reorder(productId, dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      'Appends an image. The first image of an empty gallery becomes the primary one automatically.',
  })
  add(
    @Param('productId') productId: string,
    @Body() dto: CreateProductImageDto,
  ): Promise<ProductImage> {
    return this.images.add(productId, dto);
  }

  @Patch(':imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      'Edits alt text, moves the image to another slot, or promotes it to primary.',
  })
  update(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
    @Body() dto: UpdateProductImageDto,
  ): Promise<ProductImage> {
    return this.images.update(productId, imageId, dto);
  }

  @Delete(':imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async remove(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ): Promise<void> {
    await this.images.remove(productId, imageId);
  }
}
