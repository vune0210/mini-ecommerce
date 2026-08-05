import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(255) name: string;
  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(280)
  slug: string;
  @ApiProperty() @IsString() @MinLength(1) description: string;
  @ApiProperty({ example: 19.99 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  price: number;
  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  imageUrl?: string;
  @ApiPropertyOptional({
    example: 'TSH-BLK-M',
    description: 'Warehouse identifier. Unique across the catalogue when set.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/, {
    message: 'sku must be letters, digits, dot, hyphen or underscore',
  })
  @MaxLength(64)
  sku?: string;
  @ApiPropertyOptional({
    example: true,
    description:
      'Unpublished products are hidden from the storefront and refused at add-to-cart. Defaults to published.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
  @ApiProperty() @IsUUID() categoryId: string;
}
