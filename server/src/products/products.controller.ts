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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto, ProductSort } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}
  @Get()
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Case-insensitive product-name search.',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Category UUID filter.',
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
  @ApiQuery({ name: 'sort', required: false, enum: ProductSort })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 12 })
  findAll(
    @Query() query: ListProductsDto,
  ): Promise<{ items: Product[]; total: number; page: number; limit: number }> {
    return this.productsService.findAll(query);
  }
  @Get(':id') findOne(@Param('id') id: string): Promise<Product> {
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
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async remove(@Param('id') id: string): Promise<void> {
    await this.productsService.remove(id);
  }
}
