import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateProductImageDto {
  @ApiPropertyOptional({
    description: 'Send null to clear the description; omit to leave it alone.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  altText?: string | null;

  @ApiPropertyOptional({
    description:
      'Moves the image to this slot and closes the gap it left, rather than parking two images on the same number.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({
    description:
      'true promotes this image and demotes the current primary. false is ignored: a gallery with no primary would blank the product thumbnail, so callers promote a different image instead.',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
