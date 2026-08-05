import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Email is deliberately absent. Changing it is an identity change that needs a
 * verification round-trip this project has no mail transport for, and allowing
 * it here would let an account silently take over another person's address.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Customer' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;
}
