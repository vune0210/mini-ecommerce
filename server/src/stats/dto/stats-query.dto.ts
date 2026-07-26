import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class StatsQueryDto {
  @ApiPropertyOptional({
    example: '2026-07-01',
    description:
      'Inclusive first UTC calendar day. With either bound present the aggregates and the daily series are scoped to the range; omitted, aggregates are all-time and the series trails 30 days.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-07-31',
    description: 'Inclusive last UTC calendar day.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Best-selling rows to return.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  topLimit = 5;

  @ApiPropertyOptional({
    example: 5,
    description: 'Stock at or below this value counts as low stock.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  lowStockThreshold = 5;

  @ApiPropertyOptional({
    example: 10,
    description: 'Low-stock rows to return.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  lowStockLimit = 10;
}
