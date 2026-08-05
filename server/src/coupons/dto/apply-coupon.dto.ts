import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class ApplyCouponDto {
  @ApiProperty({ example: 'SALE10' })
  @IsString()
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Length(3, 40)
  code: string;
}
