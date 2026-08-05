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
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdjustStockDto } from '../inventory/dto/adjust-stock.dto';
import { UserRole } from '../users/entities/user.entity';
import {
  BulkCategoryDto,
  BulkPriceDto,
  BulkResultDto,
  BulkVisibilityDto,
} from './dto/bulk-products.dto';
import { CreateProductDto } from './dto/create-product.dto';
import {
  ListAdminProductsDto,
  ListProductsDto,
  ProductSort,
} from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';
import {
  PaginatedProducts,
  ProductsService,
  Suggestion,
} from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}
  @Get()
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Case-insensitive match on name, slug or SKU.',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Category UUID filter.',
  })
  @ApiQuery({
    name: 'includeDescendants',
    required: false,
    description: 'Widen the category filter to every subcategory beneath it.',
  })
  @ApiQuery({
    name: 'minPrice',
    required: false,
    description: 'Inclusive lower price bound.',
  })
  @ApiQuery({
    name: 'maxPrice',
    required: false,
    description: 'Inclusive upper price bound.',
  })
  @ApiQuery({
    name: 'inStock',
    required: false,
    description: 'Keep only products with stock left.',
  })
  @ApiQuery({
    name: 'minRating',
    required: false,
    description: 'Minimum average rating, 1-5. Unrated products are excluded.',
  })
  @ApiQuery({
    name: 'tags',
    required: false,
    example: 'sale,new-arrival',
    description:
      'Comma-separated tag slugs. A product matches only when it carries every one of them.',
  })
  @ApiQuery({ name: 'sort', required: false, enum: ProductSort })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 12 })
  @ApiOkResponse({
    description: 'Published products only; unpublished ones are never listed.',
  })
  findAll(@Query() query: ListProductsDto): Promise<PaginatedProducts> {
    return this.productsService.findAll(query);
  }

  @Get('suggest')
  @ApiQuery({
    name: 'q',
    required: false,
    description:
      'Typeahead term, 2-64 characters. Shorter returns an empty list rather than the catalogue.',
  })
  @ApiOkResponse({
    description:
      'Up to 8 published products, names starting with the term ranked above names merely containing it. A narrow projection — enough for a dropdown row, nothing more.',
  })
  suggest(@Query('q') q?: string): Promise<Suggestion[]> {
    return this.productsService.suggest(q);
  }

  // Declared ahead of ':id' so the literal segment is not read as a UUID.
  @Get('slug/:slug')
  @ApiOkResponse({
    description: 'Look a published product up by its URL slug.',
  })
  findBySlug(@Param('slug') slug: string): Promise<Product> {
    return this.productsService.findBySlug(slug);
  }

  @Get(':id/related')
  @ApiOkResponse({
    description:
      'In-stock published products from the same category, best rated first.',
  })
  related(@Param('id') id: string): Promise<Product[]> {
    return this.productsService.findRelated(id);
  }

  @Get(':id')
  @ApiOkResponse({
    description:
      'Carries the full image gallery and the tag set alongside the product; listings stay on the legacy imageUrl thumbnail.',
  })
  findOne(@Param('id') id: string): Promise<Product> {
    return this.productsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  create(@Body() dto: CreateProductDto): Promise<Product> {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.productsService.update(id, dto);
  }

  @Patch(':id/stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      'Sets stock to an absolute level and appends a stock_movements entry. Prefer this over PATCH /products/:id for stock: only this path leaves an audit trail.',
  })
  adjustStock(
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<Product> {
    return this.productsService.adjustStock(id, dto, request.user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async remove(@Param('id') id: string): Promise<void> {
    await this.productsService.remove(id);
  }
}

/**
 * The catalogue as staff see it: unpublished products included. A flag on the
 * public route would have made unpublishing bypassable from the storefront.
 */
@ApiTags('admin-products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Every product, published or not. Filter with ?isActive=true|false; all the public filters apply too.',
  })
  list(@Query() query: ListAdminProductsDto): Promise<PaginatedProducts> {
    return this.productsService.findAllForAdmin(query);
  }

  // Declared before ':id' so the literal segment is not read as an identifier.
  @Patch('bulk/visibility')
  @ApiOkResponse({
    description:
      'Publish or unpublish a selection. Reports ids that matched no product rather than dropping them silently.',
  })
  bulkVisibility(@Body() dto: BulkVisibilityDto): Promise<BulkResultDto> {
    return this.productsService.bulkVisibility(dto);
  }

  @Patch('bulk/category')
  @ApiOkResponse({ description: 'Move a selection into one category.' })
  bulkCategory(@Body() dto: BulkCategoryDto): Promise<BulkResultDto> {
    return this.productsService.bulkCategory(dto);
  }

  @Patch('bulk/price')
  @ApiOkResponse({
    description:
      'Re-price a selection by percent, by amount, or to a fixed value. A result outside the representable range skips that product and is reported in `skipped` — nothing is clamped silently, and one bad product does not abort the run.',
  })
  bulkPrice(@Body() dto: BulkPriceDto): Promise<BulkResultDto> {
    return this.productsService.bulkPrice(dto);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<Product> {
    return this.productsService.findOne(id, false);
  }
}
