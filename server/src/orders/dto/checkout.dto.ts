import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @Length(2, 100)
  recipientName: string;

  @ApiProperty({
    example: '0901234567',
    description: 'Vietnamese phone number, either 0xxxxxxxxx or +84xxxxxxxxx.',
  })
  @IsString()
  @Matches(/^(0\d{9,10}|\+84\d{9,10})$/, {
    message: 'phone must be a valid Vietnamese phone number',
  })
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

  @ApiPropertyOptional({ example: 'Giao trong gio hanh chinh.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
