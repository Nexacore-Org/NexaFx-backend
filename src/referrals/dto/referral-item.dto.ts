// src/referrals/dto/referral-item.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ReferralItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'j***@d***.com' })
  maskedEmail: string;

  @ApiProperty({ example: 'John' })
  firstName: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  createdAt: Date;
}