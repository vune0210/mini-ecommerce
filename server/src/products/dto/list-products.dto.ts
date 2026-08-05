import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum ProductSort {
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  RATING_DESC = 'rating_desc',
  NAME_ASC = 'name_asc',
}

/** Shared by the query-string booleans; only the two literals convert. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

export class ListProductsDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive match on the product name, SKU or slug.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional() @IsUUID() categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Include products of every descendant category, not just the named one.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeDescendants?: boolean;

  // Prices are decimal(10,2), so the bounds must accept cents too.
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Keep only products with stock left.' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  inStock?: boolean;

  /**
   * Narrowing, not widening: a product must carry every slug listed. Tags are
   * how a shopper drills down ("sale" *and* "waterproof"), and an OR filter
   * returns a wider page with each extra tick, which nobody reads that way.
   */
  @ApiPropertyOptional({
    example: 'sale,new-arrival',
    description:
      'Comma-separated tag slugs. A product matches only when it carries all of them. Unknown slugs simply match nothing.',
  })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Minimum average rating, 1-5.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(5)
  minRating?: number;

  @IsOptional() @IsEnum(ProductSort) sort: ProductSort = ProductSort.NEWEST;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 12;
}

/**
 * The admin catalogue view. Separate from the public DTO rather than a flag on
 * it: `isActive` must not be a query parameter the storefront can set, or
 * unpublishing a product would be one crafted URL away from meaningless.
 */
export class ListAdminProductsDto extends ListProductsDto {
  @ApiPropertyOptional({
    description:
      'Filter by publication state. Omit to see published and unpublished alike.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}
