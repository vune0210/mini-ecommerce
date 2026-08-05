import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { StockMovementReason } from '../entities/stock-movement.entity';

/** The two reasons a human may write; SALE and CANCELLATION belong to orders. */
export enum ManualStockReason {
  ADJUSTMENT = StockMovementReason.ADJUSTMENT,
  RESTOCK = StockMovementReason.RESTOCK,
}

export class AdjustStockDto {
  @ApiProperty({
    example: 25,
    description:
      'The stock level the product should end up at. Absolute rather than a delta so a retried request cannot double-count.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ enum: ManualStockReason })
  @IsOptional()
  @IsEnum(ManualStockReason)
  reason: ManualStockReason = ManualStockReason.ADJUSTMENT;

  @ApiPropertyOptional({ example: 'Kiem ke kho thang 7' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
