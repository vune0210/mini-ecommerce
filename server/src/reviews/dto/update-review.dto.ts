import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateReviewDto {
  // ValidateIf rather than IsOptional: IsOptional would let an explicit null
  // through to the NOT NULL rating column.
  @ApiPropertyOptional({ minimum: 1, maximum: 5, example: 4 })
  @ValidateIf((dto: UpdateReviewDto) => dto.rating !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  /** An explicit null clears the comment. */
  @ApiPropertyOptional({ nullable: true, example: 'Da doi y, san pham on.' })
  @ValidateIf(
    (dto: UpdateReviewDto) => dto.comment !== undefined && dto.comment !== null,
  )
  @IsString()
  @MaxLength(1000)
  comment?: string | null;
}
