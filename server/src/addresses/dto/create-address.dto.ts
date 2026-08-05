import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { VN_PHONE_MESSAGE, VN_PHONE_PATTERN } from '../address-rules';

export class CreateAddressDto {
  @ApiPropertyOptional({ example: 'Nha rieng' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @Length(2, 100)
  recipientName: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  @Matches(VN_PHONE_PATTERN, { message: VN_PHONE_MESSAGE })
  phone: string;

  @ApiProperty({ example: '12 Nguyen Hue' })
  @IsString()
  @Length(5, 255)
  addressLine: string;

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

  @ApiProperty({ example: 'Ho Chi Minh' })
  @IsString()
  @Length(2, 100)
  city: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Makes this the default destination. The very first saved address becomes the default regardless.',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
