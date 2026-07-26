import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class StatsQueryDto {
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
