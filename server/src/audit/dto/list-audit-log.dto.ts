import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListAuditLogDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ description: 'Admin whose actions to show.' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({
    example: 'product.update',
    description: 'Exact action name; see GET /admin/audit-log/actions.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ example: 'product' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  resourceType?: string;

  @ApiPropertyOptional({
    description:
      'Usually paired with resourceType — ids are only unique per type.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  resourceId?: string;

  @ApiPropertyOptional({
    example: '2026-07-01',
    description: 'Inclusive first UTC calendar day.',
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
}
