import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCouponDto } from './create-coupon.dto';

/**
 * The code is immutable. Renaming it would orphan every printed or shared
 * instance of the old string while the redemption ledger still points at the
 * same row — admins deactivate and create instead.
 */
export class UpdateCouponDto extends PartialType(
  OmitType(CreateCouponDto, ['code'] as const),
) {}
