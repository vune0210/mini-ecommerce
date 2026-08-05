import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Deliberately carries no `isOfficial`: the badge is derived from the author's
 * role by the service. A field here would let any customer claim to answer for
 * the shop, and `forbidNonWhitelisted` rejects the attempt outright.
 */
export class CreateAnswerDto {
  @ApiProperty({
    example: 'Co, san pham ho tro sac nhanh 33W.',
    minLength: 2,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  body: string;
}
