import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetVisibilityDto {
  @ApiProperty({
    example: true,
    description:
      'Hides the question or answer from the storefront. Reversible — the row is kept, and hiding an answer also takes it out of its question answer count.',
  })
  @IsBoolean()
  isHidden: boolean;
}
