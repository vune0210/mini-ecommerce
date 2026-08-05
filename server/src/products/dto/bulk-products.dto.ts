import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsUUID,
} from 'class-validator';
import { PriceAdjustmentMode } from '../bulk-rules';

/**
 * The cap is the point of the base class. An unbounded id list turns one
 * request into an unbounded transaction holding row locks across the whole
 * catalogue, and 200 is already far more than a human selects by hand.
 */
export class BulkProductSelectionDto {
  @ApiProperty({ type: [String], maxItems: 200 })
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  productIds: string[];
}

export class BulkVisibilityDto extends BulkProductSelectionDto {
  @ApiProperty({
    example: false,
    description:
      'Unpublishing hides the products from the storefront and refuses them at add-to-cart and checkout.',
  })
  @IsBoolean()
  isActive: boolean;
}

export class BulkCategoryDto extends BulkProductSelectionDto {
  @ApiProperty()
  @IsUUID()
  categoryId: string;
}

export class BulkPriceDto extends BulkProductSelectionDto {
  @ApiProperty({ enum: PriceAdjustmentMode })
  @IsEnum(PriceAdjustmentMode)
  mode: PriceAdjustmentMode;

  @ApiProperty({
    example: -10,
    description:
      'Percent or amount to move by (negative discounts), or the new price in SET mode.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  value: number;
}

export type BulkSkip = { productId: string; reason: string };

/**
 * Partial success is reported, never hidden. A bulk price change that could
 * not touch three products has to say which three — "updated: 47" alone leaves
 * an admin believing the catalogue is in a state it is not.
 */
export class BulkResultDto {
  @ApiProperty({ example: 47 })
  updated: number;

  @ApiPropertyOptional({ type: [Object] })
  skipped: BulkSkip[];
}
