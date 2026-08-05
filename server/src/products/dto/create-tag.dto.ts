import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ example: 'Bán chạy' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  /**
   * Free-form rather than pattern-matched: the service normalizes whatever
   * arrives, so a caller sending "Bán chạy" gets `ban-chay` instead of a 400
   * telling them to slugify Vietnamese themselves.
   */
  @ApiPropertyOptional({
    example: 'ban-chay',
    description: 'Derived from the name when omitted. Always normalized.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  slug?: string;
}
