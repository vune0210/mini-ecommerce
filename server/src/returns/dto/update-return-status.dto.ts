import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ReturnStatus } from '../entities/return-request.entity';

export class UpdateReturnStatusDto {
  @ApiProperty({ enum: ReturnStatus, example: ReturnStatus.APPROVED })
  @IsEnum(ReturnStatus)
  status: ReturnStatus;

  /** An explicit null is treated the same as an omitted note. */
  @ApiPropertyOptional({
    example: 'Parcel received, all items intact',
    maxLength: 500,
    nullable: true,
    description:
      'Optional audit note recorded on the return status-history event.',
  })
  @ValidateIf(
    (dto: UpdateReturnStatusDto) => dto.note !== undefined && dto.note !== null,
  )
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
