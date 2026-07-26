import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, ValidateIf } from 'class-validator';
import { OrderStatus } from '../entities/order.entity';
export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.PAID })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  /** An explicit null is treated the same as an omitted note. */
  @ApiPropertyOptional({
    example: 'Payment confirmed by bank transfer',
    maxLength: 500,
    nullable: true,
    description:
      'Optional audit note recorded on the order status-history event.',
  })
  @ValidateIf(
    (dto: UpdateOrderStatusDto) => dto.note !== undefined && dto.note !== null,
  )
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
