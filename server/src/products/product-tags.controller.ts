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
import { CreateTagDto } from './dto/create-tag.dto';
import { SetProductTagsDto } from './dto/set-product-tags.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { ProductTag } from './entities/product-tag.entity';
import { ProductTagsService } from './product-tags.service';

/**
 * Tags are catalogue-wide, so they sit at /tags rather than under a product —
 * the storefront needs the whole vocabulary to render a filter bar before any
 * product is chosen.
 */
@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: ProductTagsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Every tag, each carrying productCount — how many published products wear it.',
  })
  findAll(): Promise<ProductTag[]> {
    return this.tags.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      'Creates a tag. The slug is normalized, and derived from the name when omitted.',
  })
  create(@Body() dto: CreateTagDto): Promise<ProductTag> {
    return this.tags.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      'Renaming leaves the slug alone so existing ?tags= links keep working; send slug explicitly to change it.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ): Promise<ProductTag> {
    return this.tags.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async remove(@Param('id') id: string): Promise<void> {
    await this.tags.remove(id);
  }
}

@ApiTags('tags')
@Controller('products/:productId/tags')
export class ProductTagsController {
  constructor(private readonly tags: ProductTagsService) {}

  /** PUT, not PATCH: the body is the product's complete tag set, not a delta. */
  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      'Replaces the product tag set and returns it. An empty tagIds array clears every tag.',
  })
  replace(
    @Param('productId') productId: string,
    @Body() dto: SetProductTagsDto,
  ): Promise<ProductTag[]> {
    return this.tags.setProductTags(productId, dto);
  }
}
