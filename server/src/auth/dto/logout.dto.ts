import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsJWT, IsOptional } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description:
      'The refresh token to revoke. Omit to revoke every session of the caller — the access token stays valid until it expires either way.',
  })
  @IsOptional()
  @IsJWT()
  refreshToken?: string;
}
