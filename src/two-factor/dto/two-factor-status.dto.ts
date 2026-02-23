import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorStatusDto {
  @ApiProperty({ example: false })
  isTwoFactorEnabled: boolean;
}
