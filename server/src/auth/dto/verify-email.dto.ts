import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'The single-use secret from the verification email.',
  })
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token: string;
}
