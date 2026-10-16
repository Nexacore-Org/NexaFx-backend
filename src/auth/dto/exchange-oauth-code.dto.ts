import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ExchangeOauthCodeDto {
  @ApiProperty({
    description:
      'One-time code returned in the OAuth redirect URL (valid for 60 seconds)',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}