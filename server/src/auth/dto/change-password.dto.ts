import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  // bcrypt truncates at 72 bytes; accepting more would silently ignore the tail.
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({ minLength: 8, example: 'NewPassword456!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
