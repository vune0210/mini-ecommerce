import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  VN_PHONE_MESSAGE,
  VN_PHONE_PATTERN,
} from '../../addresses/address-rules';
import { PaymentMethod } from '../entities/order.entity';

/**
 * Two ways to say where the parcel goes: name a saved address, or spell the
 * destination out inline. `@ValidateIf` rather than a hand-rolled either/or
 * check in the service, so the inline branch keeps its per-field 400 messages
 * ("phone must be a valid Vietnamese phone number") instead of collapsing into
 * one opaque "shipping details required".
 */
const inlineAddress = (dto: CheckoutDto): boolean => !dto.addressId;

export class CheckoutDto {
  @ApiPropertyOptional({
    description:
      'A saved address of the caller. When present the inline shipping fields are ignored.',
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({ example: 'Nguyen Van A' })
  @ValidateIf(inlineAddress)
  @IsString()
  @Length(2, 100)
  recipientName?: string;

  @ApiPropertyOptional({
    example: '0901234567',
    description: 'Vietnamese phone number, either 0xxxxxxxxx or +84xxxxxxxxx.',
  })
  @ValidateIf(inlineAddress)
  @IsString()
  @Matches(VN_PHONE_PATTERN, { message: VN_PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({ example: '12 Nguyen Hue' })
  @ValidateIf(inlineAddress)
  @IsString()
  @Length(5, 255)
  addressLine?: string;

  @ApiPropertyOptional({ example: 'Phuong Ben Nghe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string;

  @ApiPropertyOptional({ example: 'Quan 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @ApiPropertyOptional({ example: 'Ho Chi Minh' })
  @ValidateIf(inlineAddress)
  @IsString()
  @Length(2, 100)
  city?: string;

  @ApiPropertyOptional({ example: 'Giao trong gio hanh chinh.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    example: 'SALE10',
    description:
      'Re-validated here even if /coupons/preview already accepted it — the last redemption may have gone to someone else in between.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Length(3, 40)
  couponCode?: string;

  @ApiProperty({ enum: PaymentMethod, default: PaymentMethod.COD })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod = PaymentMethod.COD;
}
