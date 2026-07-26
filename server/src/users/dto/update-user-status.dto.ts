import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    example: false,
    description:
      'false deactivates the account; a deactivated user is rejected on login, refresh, and every authenticated request.',
  })
  @IsBoolean()
  isActive: boolean;
}
