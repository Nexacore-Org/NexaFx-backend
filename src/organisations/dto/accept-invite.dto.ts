import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Invite token received by email' })
  @IsUUID()
  token: string;
}
