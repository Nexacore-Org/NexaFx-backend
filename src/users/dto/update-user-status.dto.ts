import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiProperty({
    example: true,
    description: 'Whether the user account is active',
  })
  @IsNotEmpty()
  @IsBoolean()
  isActive: boolean;
}
