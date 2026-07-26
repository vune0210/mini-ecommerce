import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '../../orders/entities/order.entity';

export class ExportOrdersDto {
  @ApiPropertyOptional({
    example: '2026-07-01',
    description: 'Inclusive first UTC calendar day for order created_at.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-07-31',
    description: 'Inclusive last UTC calendar day for order created_at.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: OrderStatus,
    example: OrderStatus.COMPLETED,
    description:
      'Restrict rows to one status. The export is a record of what happened, so it deliberately includes every status by default.',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
