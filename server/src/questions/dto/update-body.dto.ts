import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Shared by both PATCH endpoints: the text is the only field an author owns on
 * either a question or an answer. Moderation state and the official badge are
 * decided elsewhere, so two identical DTOs would only invite one of them to
 * grow a field the other should not have.
 */
export class UpdateBodyDto {
  @ApiProperty({ example: 'San pham nay co ho tro sac nhanh 33W khong?' })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  body: string;
}
