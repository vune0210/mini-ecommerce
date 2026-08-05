import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ModerateReviewDto {
  @ApiProperty({
    example: true,
    description:
      'Hides the review from the storefront and from the rating average. Reversible — the row is kept.',
  })
  @IsBoolean()
  isHidden: boolean;
}
