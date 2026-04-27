import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeviceTokenDto {
  @ApiProperty({
    description: 'The FCM device token for push notifications',
    example: 'bk3RNwTe3H0:CI2k_HHwgIpoDKCIZvvDMExUdFQ3P1...',
  })
  @IsNotEmpty()
  @IsString()
  token: string;
}
