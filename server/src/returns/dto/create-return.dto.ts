import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ReturnReason } from '../entities/return-request.entity';

export class ReturnLineDto {
  @ApiProperty({ description: 'An order line of the order being returned.' })
  @IsUUID()
  orderItemId: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateReturnDto {
  @ApiProperty()
  @IsUUID()
  orderId: string;

  @ApiProperty({ enum: ReturnReason, example: ReturnReason.DAMAGED })
  @IsEnum(ReturnReason)
  reason: ReturnReason;

  /** An explicit null is treated the same as an omitted note. */
  @ApiPropertyOptional({
    example: 'Screen arrived cracked.',
    maxLength: 500,
    nullable: true,
    description: 'Free-text detail; also recorded on the creation event.',
  })
  @ValidateIf(
    (dto: CreateReturnDto) => dto.note !== undefined && dto.note !== null,
  )
  @IsString()
  @MaxLength(500)
  note?: string | null;

  /**
   * Capped so one payload cannot ask the service to lock an unbounded number of
   * product rows; no real order has a thousand distinct lines.
   */
  @ApiProperty({ type: [ReturnLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  items: ReturnLineDto[];
}
