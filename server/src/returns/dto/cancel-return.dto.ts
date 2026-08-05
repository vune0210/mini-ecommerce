import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

export class CancelReturnDto {
  /** An explicit null is treated the same as an omitted note. */
  @ApiPropertyOptional({
    example: 'Kept the item after all',
    maxLength: 500,
    nullable: true,
    description:
      'Optional withdrawal reason recorded on the return status-history event.',
  })
  @ValidateIf(
    (dto: CancelReturnDto) => dto.note !== undefined && dto.note !== null,
  )
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
