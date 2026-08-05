import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Every switch is optional: the settings screen sends only what the customer
 * toggled, so a stale tab cannot re-enable a category someone muted elsewhere.
 *
 * There is no switch for ACCOUNT_SECURITY, by design — see the entity.
 */
export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({
    example: true,
    description: 'ORDER_PLACED and ORDER_STATUS_CHANGED.',
  })
  @IsOptional()
  @IsBoolean()
  orderUpdates?: boolean;

  @ApiPropertyOptional({ example: true, description: 'REVIEW_MODERATED.' })
  @IsOptional()
  @IsBoolean()
  reviewUpdates?: boolean;

  @ApiPropertyOptional({ example: false, description: 'COUPON_EXPIRING.' })
  @IsOptional()
  @IsBoolean()
  promotions?: boolean;

  @ApiPropertyOptional({ example: true, description: 'STOCK_BACK.' })
  @IsOptional()
  @IsBoolean()
  stockAlerts?: boolean;

  @ApiPropertyOptional({ example: true, description: 'ANSWER_POSTED.' })
  @IsOptional()
  @IsBoolean()
  productAnswers?: boolean;
}
