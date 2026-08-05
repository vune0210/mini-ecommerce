import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The single-use secret from the reset email.' })
  @IsString()
  // Bounded at both ends: shorter than a minted token cannot be genuine, and an
  // unbounded string would be hashed — and therefore paid for — before the
  // lookup can reject it.
  @MinLength(16)
  @MaxLength(256)
  token: string;

  @ApiProperty({ minLength: 8, example: 'NewPassword456!' })
  @IsString()
  @MinLength(8)
  // bcrypt truncates at 72 bytes; accepting more would silently ignore the tail.
  @MaxLength(72)
  newPassword: string;
}
