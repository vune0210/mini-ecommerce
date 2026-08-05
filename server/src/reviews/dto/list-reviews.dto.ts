import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum ReviewSort {
  NEWEST = 'newest',
  /** Most upvoted first; ties fall back to newest. */
  HELPFUL = 'helpful',
  RATING_DESC = 'rating_desc',
  RATING_ASC = 'rating_asc',
}

export class ListReviewsDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;

  @ApiPropertyOptional({
    example: 5,
    description: 'Keep only reviews with this exact star rating.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Keep only reviews that carry a written comment.',
  })
  @IsOptional()
  @Transform(({ value }): unknown => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  withComment?: boolean;

  @ApiPropertyOptional({ enum: ReviewSort })
  @IsOptional()
  @IsEnum(ReviewSort)
  sort: ReviewSort = ReviewSort.NEWEST;
}

/** The moderation queue: hidden reviews included, and searchable by product. */
export class ListAdminReviewsDto extends ListReviewsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Filter by moderation state. Omit to see hidden and visible alike.',
  })
  @IsOptional()
  @Transform(({ value }): unknown => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isHidden?: boolean;
}
