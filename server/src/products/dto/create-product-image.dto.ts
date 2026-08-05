import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductImageDto {
  @ApiProperty({ example: 'https://cdn.example.com/products/tshirt-front.jpg' })
  @IsUrl()
  @MaxLength(2048)
  url: string;

  @ApiPropertyOptional({
    example: 'Black t-shirt seen from the front',
    description:
      'Screen-reader description. Left null when omitted rather than filled with the product name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  altText?: string;

  @ApiPropertyOptional({
    example: 0,
    description:
      'Slot to insert at, 0 first. Appended when omitted; a number past the end clamps to last.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      'Promote this image to the product thumbnail, demoting the current one. The first image of an empty gallery becomes primary regardless.',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
