import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';
export class CancelOrderDto {
  /** An explicit null is treated the same as an omitted note. */
  @ApiPropertyOptional({
    example: 'Ordered the wrong size',
    maxLength: 500,
    nullable: true,
    description:
      'Optional cancellation reason recorded on the order status-history event.',
  })
  @ValidateIf(
    (dto: CancelOrderDto) => dto.note !== undefined && dto.note !== null,
  )
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
